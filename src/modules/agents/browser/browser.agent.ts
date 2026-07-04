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
import { BaseAgent } from '../base/base.agent';
import type { AgentContext, AgentResult } from '../agents.types';

@Injectable()
export class BrowserAgent extends BaseAgent {
  readonly id = AgentId.BROWSER;
  readonly name = 'Browser Automation Agent';
  readonly responsibilities = [
    'Open application pages with Playwright',
    'Inspect and fill forms from profile + answers',
    'Upload tailored resume PDFs when present',
    'Pause before submit unless explicitly confirmed',
  ];

  protected readonly systemPrompt = `You are the Browser Automation Agent for RemoteHask.
Map candidate data onto HTML form fields for a job application.
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
fieldValues keys MUST be CSS selectors from the provided field list.`;

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

    try {
      const inspection = await this.browser.inspectApplicationPage(
        url,
        ctx.userId,
      );

      const resumes = await this.documents.find({
        where: {
          userId: ctx.userId,
          jobId: ctx.job.id,
          type: DocumentType.RESUME,
        },
        order: { createdAt: 'DESC' },
        take: 1,
      });
      const resume = resumes[0];
      const resumePath =
        typeof resume?.metadata?.filePath === 'string'
          ? resume.metadata.filePath
          : null;

      const prompt = `Map this candidate onto the application form.

Job: ${ctx.job.title} at ${ctx.job.company}
URL: ${inspection.url}
Page title: ${inspection.title}

Profile:
Name: ${ctx.profile?.fullName ?? ''}
Headline: ${ctx.profile?.headline ?? ''}
Email/userId: ${ctx.userId}
Skills: ${(ctx.profile?.skills ?? []).slice(0, 20).join(', ')}

Application answers:
${JSON.stringify(ctx.application?.answers ?? {}, null, 2)}

Form fields (use these selectors exactly):
${JSON.stringify(inspection.fields, null, 2)}

File inputs: ${JSON.stringify(inspection.fileInputs)}
Submit selectors: ${JSON.stringify(inspection.submitSelectors)}
Resume PDF available: ${Boolean(resumePath)}
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
          blockers: ['Claude could not produce a field mapping'],
        });
      }

      const requiresApproval =
        !autoApproved || parsed.requiresApproval !== false;

      if (requiresApproval && !autoApproved) {
        return this.ok('Browser plan ready — approve submit to fill the form', {
          executed: false,
          requiresApproval: true,
          steps: parsed.steps,
          fieldValues: parsed.fieldValues,
          canAutomate: parsed.canAutomate,
          blockers: parsed.blockers ?? [],
          notes: parsed.notes,
          inspection,
          resumePath,
        });
      }

      const execution = await this.browser.fillAndPrepareApplication({
        url: inspection.url,
        userId: ctx.userId,
        fieldValues: parsed.fieldValues ?? {},
        resumePath,
        confirmSubmit,
      });

      if (execution.submitted && ctx.application) {
        ctx.application.status = ApplicationStatus.APPLIED;
        ctx.application.submittedAt = new Date();
        await this.applications.save(ctx.application);
      }

      return this.ok(
        execution.submitted
          ? 'Application submitted via browser'
          : 'Form filled — submit not clicked (approval-only fill)',
        {
          executed: true,
          requiresApproval: !confirmSubmit,
          steps: parsed.steps,
          fieldValues: parsed.fieldValues,
          canAutomate: parsed.canAutomate,
          notes: parsed.notes,
          inspection,
          resumePath,
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
}
