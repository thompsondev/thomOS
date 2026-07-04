import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AgentId,
  Application,
  ApplicationStatus,
  Job,
} from '../../../lib/database/entities';
import { AiService } from '../../../lib/ai/ai.service';
import { BaseAgent } from '../base/base.agent';
import type { AgentContext, AgentResult } from '../agents.types';

type MatchPayload = {
  matchScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  rationale: string;
  recommendApply: boolean;
};

@Injectable()
export class MatchingAgent extends BaseAgent {
  readonly id = AgentId.MATCHING;
  readonly name = 'Matching & ATS Agent';
  readonly responsibilities = [
    'Analyse job descriptions against the master profile',
    'Compute ATS-style match scores',
    'List matched and missing skills/keywords',
    'Recommend whether to apply',
  ];

  protected readonly systemPrompt = `You are the Matching & ATS Agent for RemoteHask.
Score fit between a master profile and a job description.
Return ONLY valid JSON:
{
  "matchScore": 0-100,
  "matchedSkills": string[],
  "missingSkills": string[],
  "rationale": string,
  "recommendApply": boolean
}
Be honest. Do not inflate scores. Prefer quality over volume.`;

  constructor(
    ai: AiService,
    @InjectRepository(Job) private readonly jobs: Repository<Job>,
    @InjectRepository(Application)
    private readonly applications: Repository<Application>,
  ) {
    super(ai);
  }

  async run(ctx: AgentContext): Promise<AgentResult> {
    if (!ctx.profile || !ctx.job) {
      return this.fail('Profile and job are required for matching');
    }

    const prompt = `Score this role.

Master resume:
${ctx.profile.masterResume || ctx.profile.summary || 'n/a'}

Skills: ${(ctx.profile.skills ?? []).join(', ')}
Filters: ${JSON.stringify(ctx.profile.filters ?? {})}

Job:
Title: ${ctx.job.title}
Company: ${ctx.job.company}
Remote: ${ctx.job.remote}
Location: ${ctx.job.location ?? 'n/a'}
Description:
${ctx.job.description}`;

    try {
      const text = await this.think(prompt);
      const parsed = this.parseJson<MatchPayload>(text);
      if (!parsed || typeof parsed.matchScore !== 'number') {
        return this.fail('Matching agent returned invalid JSON');
      }

      const matchScore = Math.max(0, Math.min(100, parsed.matchScore));
      ctx.job.matchScore = matchScore;
      ctx.job.matchedSkills = parsed.matchedSkills ?? [];
      ctx.job.missingSkills = parsed.missingSkills ?? [];
      await this.jobs.save(ctx.job);

      let application = ctx.application;
      if (!application) {
        application = this.applications.create({
          userId: ctx.userId,
          jobId: ctx.job.id,
          status: ApplicationStatus.FOUND,
          matchScore,
          answers: {},
          metadata: { rationale: parsed.rationale },
        });
      } else {
        application.matchScore = matchScore;
        application.metadata = {
          ...application.metadata,
          rationale: parsed.rationale,
        };
      }
      application = await this.applications.save(application);

      return this.ok(
        `Match ${matchScore}% — ${parsed.recommendApply ? 'recommend apply' : 'weak fit'}`,
        {
          ...parsed,
          matchScore,
          applicationId: application.id,
          jobId: ctx.job.id,
        },
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(message);
      return this.fail(message);
    }
  }
}
