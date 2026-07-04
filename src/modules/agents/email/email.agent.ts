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

type EmailClassification = {
  category:
    | 'interview'
    | 'rejection'
    | 'offer'
    | 'assessment'
    | 'recruiter'
    | 'other';
  applicationStatus?: ApplicationStatus;
  interviewAt?: string | null;
  summary: string;
  calendarSuggestion?: string | null;
  requiresApproval: boolean;
};

@Injectable()
export class EmailAgent extends BaseAgent {
  readonly id = AgentId.EMAIL;
  readonly name = 'Email Monitoring Agent';
  readonly responsibilities = [
    'Classify recruiter and application emails',
    'Extract interview details and deadlines',
    'Suggest calendar entries (with approval)',
    'Update application status when confident',
  ];

  protected readonly systemPrompt = `You are the Email Monitoring Agent for RemoteHask.
Classify recruiting emails and extract actionable details.
Return ONLY valid JSON:
{
  "category": "interview" | "rejection" | "offer" | "assessment" | "recruiter" | "other",
  "applicationStatus": "found" | "applied" | "waiting" | "interview" | "rejected" | "offer" | null,
  "interviewAt": string | null,
  "summary": string,
  "calendarSuggestion": string | null,
  "requiresApproval": boolean
}`;

  constructor(
    ai: AiService,
    @InjectRepository(Application)
    private readonly applications: Repository<Application>,
  ) {
    super(ai);
  }

  async run(ctx: AgentContext): Promise<AgentResult> {
    const emailText = ctx.input?.emailText as string | undefined;
    if (!emailText?.trim()) {
      return this.fail('input.emailText is required');
    }

    const prompt = `Classify this email for user ${ctx.userId}.

Job context: ${ctx.job ? `${ctx.job.title} @ ${ctx.job.company}` : 'unknown'}
Current application status: ${ctx.application?.status ?? 'unknown'}

Email:
${emailText}`;

    try {
      const text = await this.think(prompt);
      const parsed = this.parseJson<EmailClassification>(text);
      if (!parsed?.category) {
        return this.fail('Email agent returned invalid JSON');
      }

      if (
        ctx.application &&
        parsed.applicationStatus &&
        Object.values(ApplicationStatus).includes(parsed.applicationStatus)
      ) {
        ctx.application.status = parsed.applicationStatus;
        ctx.application.metadata = {
          ...ctx.application.metadata,
          lastEmailSummary: parsed.summary,
          interviewAt: parsed.interviewAt,
        };
        await this.applications.save(ctx.application);
      }

      return this.ok(`Email classified as ${parsed.category}`, parsed);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(message);
      return this.fail(message);
    }
  }
}
