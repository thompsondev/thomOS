import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentId, EmailMessage } from '../../../lib/database/entities';
import { AiService } from '../../../lib/ai/ai.service';
import { BaseAgent } from '../base/base.agent';
import { buildExperienceSourceBlock } from '../shared/profile-context';
import type { AgentContext, AgentResult } from '../agents.types';

export type InterviewPrepResult = {
  overview: string;
  interviewFormat: string | null;
  likelyQuestions: Array<{
    question: string;
    suggestedAnswer: string;
    tips: string;
  }>;
  technicalTopics: string[];
  behavioralThemes: string[];
  questionsToAskThem: string[];
  companyResearch: string[];
  dayOfChecklist: string[];
  weakSpots: string[];
  talkingPoints: string[];
};

@Injectable()
export class InterviewPrepAgent extends BaseAgent {
  readonly id = AgentId.INTERVIEW_PREP;
  readonly name = 'Interview Prep Agent';
  readonly responsibilities = [
    'Build a focused prep pack for one specific interview',
    'Draft answers grounded in the master profile only',
    'Surface technical topics and questions to ask the interviewer',
    'Provide a day-of checklist and honest weak spots',
  ];

  protected readonly systemPrompt = `You are the Interview Prep Agent for RemoteHask.
Prepare the candidate for ONE specific upcoming interview.
Use ONLY facts from the provided master profile — never invent employers, projects, or metrics.
Return ONLY valid JSON:
{
  "overview": string,
  "interviewFormat": string | null,
  "likelyQuestions": [
    { "question": string, "suggestedAnswer": string, "tips": string }
  ],
  "technicalTopics": string[],
  "behavioralThemes": string[],
  "questionsToAskThem": string[],
  "companyResearch": string[],
  "dayOfChecklist": string[],
  "weakSpots": string[],
  "talkingPoints": string[]
}
Keep answers concise, speakable, and specific to the role and company.`;

  constructor(
    ai: AiService,
    @InjectRepository(EmailMessage)
    private readonly emails: Repository<EmailMessage>,
  ) {
    super(ai);
  }

  async run(ctx: AgentContext): Promise<AgentResult> {
    if (!ctx.profile) {
      return this.fail('Profile is required for interview prep');
    }
    if (!ctx.job) {
      return this.fail('Job is required for interview prep');
    }

    const experienceBlock = buildExperienceSourceBlock(ctx.profile);
    const emailContext = await this.loadEmailContext(ctx);

    const prompt = `Prepare this candidate for an interview.

${experienceBlock}

TARGET ROLE:
Title: ${ctx.job.title}
Company: ${ctx.job.company}
Location: ${ctx.job.location ?? 'n/a'}
Remote: ${ctx.job.remote ? 'yes' : 'no'}
Source: ${ctx.job.source ?? 'n/a'}

JOB DESCRIPTION:
${ctx.job.description}

APPLICATION CONTEXT:
Status: ${ctx.application?.status ?? 'n/a'}
Match score: ${ctx.application?.matchScore ?? ctx.job.matchScore ?? 'n/a'}
Matched skills: ${(ctx.job.matchedSkills ?? []).join(', ') || 'n/a'}
Missing skills: ${(ctx.job.missingSkills ?? []).join(', ') || 'n/a'}
Application answers already drafted:
${JSON.stringify(ctx.application?.answers ?? {}, null, 2)}

INTERVIEW DETAILS:
${emailContext.details}

Focus areas requested: ${(ctx.input?.focus as string) ?? 'full interview prep'}
Interview format hint: ${(ctx.input?.interviewFormat as string) ?? emailContext.format ?? 'unknown — infer from job + email if possible'}`;

    try {
      const text = await this.think(prompt);
      const parsed = this.parseJson<InterviewPrepResult>(text);

      if (!parsed) {
        return this.fail('Interview prep agent returned invalid JSON');
      }

      return this.ok(
        `Interview prep ready for ${ctx.job.title} at ${ctx.job.company}`,
        {
          jobId: ctx.job.id,
          applicationId: ctx.application?.id ?? null,
          emailId: emailContext.emailId,
          ...parsed,
        },
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(message);
      return this.fail(message);
    }
  }

  private async loadEmailContext(ctx: AgentContext): Promise<{
    emailId: string | null;
    format: string | null;
    details: string;
  }> {
    const emailId = ctx.input?.emailId as string | undefined;
    if (!emailId) {
      const manualAt = ctx.input?.interviewAt as string | undefined;
      const manualNotes = ctx.input?.interviewNotes as string | undefined;
      if (manualAt || manualNotes) {
        return {
          emailId: null,
          format: (ctx.input?.interviewFormat as string) ?? null,
          details: [
            manualAt ? `Scheduled: ${manualAt}` : null,
            manualNotes ? `Notes: ${manualNotes}` : null,
          ]
            .filter(Boolean)
            .join('\n'),
        };
      }
      return { emailId: null, format: null, details: '(none — general prep)' };
    }

    const email = await this.emails.findOne({
      where: { id: emailId, userId: ctx.userId },
    });
    if (!email) {
      return {
        emailId,
        format: null,
        details: `(email ${emailId} not found)`,
      };
    }

    return {
      emailId: email.id,
      format: email.calendarSuggestion,
      details: [
        email.subject ? `Subject: ${email.subject}` : null,
        email.interviewAt
          ? `Interview at: ${email.interviewAt.toISOString()}`
          : null,
        email.calendarSuggestion
          ? `Calendar suggestion: ${email.calendarSuggestion}`
          : null,
        email.summary ? `Summary: ${email.summary}` : null,
        email.body ? `Email body:\n${email.body.slice(0, 4000)}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
    };
  }
}
