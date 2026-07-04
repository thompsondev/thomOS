import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AgentId,
  Application,
  ApplicationStatus,
} from '../../../lib/database/entities';
import { AiService } from '../../../lib/ai/ai.service';
import { BaseAgent } from '../base/base.agent';
import type { AgentContext, AgentResult } from '../agents.types';

@Injectable()
export class ApplicationAgent extends BaseAgent {
  readonly id = AgentId.APPLICATION;
  readonly name = 'Application Assistant Agent';
  readonly responsibilities = [
    'Answer application form questions from real experience',
    'Prepare the application package for review',
    'Enforce approval-before-submit by default',
  ];

  protected readonly systemPrompt = `You are the Application Assistant Agent for RemoteHask.
Answer application questions using ONLY the candidate's real experience.
If a fact is missing, say so in the answer value as "[NEEDS USER INPUT: ...]".
Return ONLY valid JSON:
{
  "answers": { "<question>": "<answer>" },
  "readyToSubmit": boolean,
  "requiresApproval": boolean,
  "notes": string
}
requiresApproval must be true unless the user explicitly approved auto-submit.`;

  constructor(
    ai: AiService,
    @InjectRepository(Application)
    private readonly applications: Repository<Application>,
  ) {
    super(ai);
  }

  async run(ctx: AgentContext): Promise<AgentResult> {
    if (!ctx.profile || !ctx.job) {
      return this.fail('Profile and job are required');
    }

    const questions = (ctx.input?.questions as string[] | undefined) ?? [
      'Why do you want to work here?',
      'What makes you a strong fit for this role?',
      'What is your notice period / availability?',
    ];

    const prompt = `Prepare application answers.

Candidate profile:
Name: ${ctx.profile.fullName ?? 'n/a'}
Headline: ${ctx.profile.headline ?? 'n/a'}
Resume:
${ctx.profile.masterResume || ctx.profile.summary || 'n/a'}

Job: ${ctx.job.title} at ${ctx.job.company}
Description:
${ctx.job.description}

Questions:
${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

Auto-submit approved for this application: ${Boolean(ctx.application?.autoSubmitApproved)}`;

    try {
      const text = await this.think(prompt);
      const parsed = this.parseJson<{
        answers: Record<string, string>;
        readyToSubmit: boolean;
        requiresApproval: boolean;
        notes: string;
      }>(text);
      if (!parsed?.answers) {
        return this.fail('Application agent returned invalid JSON');
      }

      let application = ctx.application;
      if (!application) {
        application = this.applications.create({
          userId: ctx.userId,
          jobId: ctx.job.id,
          status: ApplicationStatus.FOUND,
          matchScore: ctx.job.matchScore,
          answers: {},
          metadata: {},
        });
      }

      application.answers = {
        ...application.answers,
        ...parsed.answers,
      };
      application.metadata = {
        ...application.metadata,
        readyToSubmit: parsed.readyToSubmit,
        requiresApproval: parsed.requiresApproval !== false,
        applicationNotes: parsed.notes,
      };
      application = await this.applications.save(application);

      return this.ok('Application package prepared', {
        applicationId: application.id,
        answers: application.answers,
        readyToSubmit: parsed.readyToSubmit,
        requiresApproval: parsed.requiresApproval !== false,
        notes: parsed.notes,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(message);
      return this.fail(message);
    }
  }
}
