import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AgentId,
  Application,
  ApplicationStatus,
  Document,
  DocumentType,
} from '../../../lib/database/entities';
import { AiService } from '../../../lib/ai/ai.service';
import { BrowserService } from '../../../lib/browser/browser.service';
import {
  detectBoard,
  isAutomatableBoard,
  unsupportedBoardMessage,
} from '../../../lib/browser/board-detector';
import { BaseAgent } from '../base/base.agent';
import type { AgentContext, AgentResult } from '../agents.types';

@Injectable()
export class BrowserAgent extends BaseAgent {
  readonly id = AgentId.BROWSER;
  readonly name = 'Browser Automation Agent';
  readonly responsibilities = [
    'Detect Greenhouse, Lever, Ashby, Workable, and generic boards',
    'Open apply forms and fill profile fields heuristically',
    'Upload tailored resume and cover letter PDFs',
    'Pause before submit unless explicitly confirmed',
    'Skip LinkedIn and Indeed (ToS / anti-bot) — use email or ATS boards',
  ];

  protected readonly systemPrompt = `You are the Browser Automation Agent for RemoteHask.
Map candidate data onto HTML form fields for a job application board.
Never invent credentials or personal data not provided.
Return ONLY valid JSON:
{
  "steps": string[],
  "fieldValues": { "<css selector>": "<value>" },
  "canAutomate": boolean,
  "requiresApproval": boolean,
  "blockers": string[],
  "notes": string
}
fieldValues keys MUST be CSS selectors from the provided field list.
Prefer board-native fields (first name, last name, email, phone, LinkedIn).`;

  constructor(
    ai: AiService,
    private readonly browser: BrowserService,
    @InjectRepository(Document)
    private readonly documents: Repository<Document>,
    @InjectRepository(Application)
    private readonly applications: Repository<Application>,
  ) {
    super(ai);
  }

  async run(ctx: AgentContext): Promise<AgentResult> {
    if (!ctx.job) {
      return this.fail('Job is required for browser automation');
    }

    const url = ctx.job.sourceUrl?.trim();
    if (!url) {
      return this.fail(
        'Job has no sourceUrl — add an application URL before browser automation',
      );
    }

    const autoApproved = Boolean(ctx.application?.autoSubmitApproved);
    const confirmSubmit = Boolean(ctx.input?.confirmSubmit) && autoApproved;
    const board = detectBoard(url, ctx.job.source);

    const blocked = unsupportedBoardMessage(board);
    if (!isAutomatableBoard(board) && blocked) {
      return this.ok(blocked, {
        executed: false,
        requiresApproval: false,
        board,
        canAutomate: false,
        blockers: [blocked],
        alternatives: [
          'Use Email CV to send tailored resume + cover letter',
          'Find the company Greenhouse, Lever, or Ashby listing and use Fill form there',
        ],
      });
    }

    try {
      const inspection = await this.browser.inspectApplicationPage(
        url,
        ctx.userId,
        ctx.job.source,
      );

      const resumePath = await this.latestDocPath(
        ctx.userId,
        ctx.job.id,
        DocumentType.RESUME,
      );
      const coverLetterPath = await this.latestDocPath(
        ctx.userId,
        ctx.job.id,
        DocumentType.COVER_LETTER,
      );

      const prompt = `Map this candidate onto the application form.

Board: ${inspection.board}
Job: ${ctx.job.title} at ${ctx.job.company}
URL: ${inspection.url}
Page title: ${inspection.title}

Profile:
Name: ${ctx.profile?.fullName ?? ''}
Headline: ${ctx.profile?.headline ?? ''}
Email/userId: ${ctx.userId}
Phone: ${ctx.profile?.phone ?? ''}
LinkedIn: ${ctx.profile?.linkedinUrl ?? ''}
Location filters: ${JSON.stringify(ctx.profile?.filters?.locations ?? [])}
Skills: ${(ctx.profile?.skills ?? []).slice(0, 20).join(', ')}

Application answers:
${JSON.stringify(ctx.application?.answers ?? {}, null, 2)}

Form fields (use these selectors exactly):
${JSON.stringify(inspection.fields, null, 2)}

File inputs: ${JSON.stringify(inspection.fileInputs)}
Submit selectors: ${JSON.stringify(inspection.submitSelectors)}
Resume PDF available: ${Boolean(resumePath)}
Cover letter PDF available: ${Boolean(coverLetterPath)}
Auto-submit approved: ${autoApproved}
Confirm submit requested: ${confirmSubmit}`;

      const text = await this.think(prompt);
      const parsed = this.parseJson<{
        steps: string[];
        fieldValues: Record<string, string>;
        canAutomate: boolean;
        requiresApproval: boolean;
        blockers: string[];
        notes: string;
      }>(text);

      if (!parsed) {
        return this.ok('Inspected page; could not map fields', {
          executed: false,
          requiresApproval: true,
          inspection,
          resumePath,
          coverLetterPath,
          blockers: ['Claude could not produce a field mapping'],
        });
      }

      const requiresApproval =
        !autoApproved || parsed.requiresApproval !== false;

      if (requiresApproval && !autoApproved) {
        return this.ok(
          `Browser plan ready for ${inspection.board} — approve submit to fill the form`,
          {
            executed: false,
            requiresApproval: true,
            board: inspection.board,
            steps: parsed.steps,
            fieldValues: parsed.fieldValues,
            canAutomate: parsed.canAutomate,
            blockers: parsed.blockers ?? [],
            notes: parsed.notes,
            inspection,
            resumePath,
            coverLetterPath,
          },
        );
      }

      const execution = await this.browser.fillAndPrepareApplication({
        url: inspection.url,
        userId: ctx.userId,
        fieldValues: parsed.fieldValues ?? {},
        resumePath,
        coverLetterPath,
        source: ctx.job.source,
        profile: {
          fullName: ctx.profile?.fullName,
          email: ctx.userId,
          location: ctx.profile?.filters?.locations?.[0] ?? null,
          linkedin: ctx.profile?.linkedinUrl ?? null,
          phone: ctx.profile?.phone ?? null,
        },
        confirmSubmit,
      });

      if (execution.submitted && ctx.application) {
        ctx.application.status = ApplicationStatus.APPLIED;
        ctx.application.submittedAt = new Date();
        await this.applications.save(ctx.application);
      }

      return this.ok(
        execution.submitted
          ? `Application submitted via ${execution.board}`
          : `Form filled on ${execution.board} — submit not clicked`,
        {
          executed: true,
          requiresApproval: !confirmSubmit,
          steps: parsed.steps,
          fieldValues: parsed.fieldValues,
          canAutomate: parsed.canAutomate,
          notes: parsed.notes,
          inspection,
          resumePath,
          coverLetterPath,
          ...execution,
          blockers: [...(parsed.blockers ?? []), ...execution.blockers],
        },
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(message);
      return this.fail(message);
    }
  }

  private async latestDocPath(
    userId: string,
    jobId: string,
    type: DocumentType,
  ): Promise<string | null> {
    const rows = await this.documents.find({
      where: { userId, jobId, type },
      order: { createdAt: 'DESC' },
      take: 1,
    });
    const path = rows[0]?.metadata?.filePath;
    return typeof path === 'string' ? path : null;
  }
}
