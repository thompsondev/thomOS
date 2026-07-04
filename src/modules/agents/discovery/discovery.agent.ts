import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentId, Job } from '../../../lib/database/entities';
import { AiService } from '../../../lib/ai/ai.service';
import { BaseAgent } from '../base/base.agent';
import type { AgentContext, AgentResult } from '../agents.types';

type DiscoveredJob = {
  title: string;
  company: string;
  location?: string;
  remote?: boolean;
  source?: string;
  sourceUrl?: string;
  description: string;
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
};

@Injectable()
export class DiscoveryAgent extends BaseAgent {
  readonly id = AgentId.DISCOVERY;
  readonly name = 'Job Discovery Agent';
  readonly responsibilities = [
    'Search and monitor job boards and career pages',
    'Filter roles against the user profile criteria',
    'Normalize listings into structured job records',
    'Avoid low-quality or off-criteria noise',
  ];

  protected readonly systemPrompt = `You are the Job Discovery Agent for RemoteHask.
Your only job is to find and structure roles that match the user's filters and profile.
Return ONLY valid JSON: an array of jobs with fields:
title, company, location, remote (boolean), source, sourceUrl, description, salaryMin, salaryMax, currency.
Prefer quality over quantity. Never invent employer names or URLs you cannot support.
If you lack live listings, return an empty array rather than fabricating jobs.`;

  constructor(
    ai: AiService,
    @InjectRepository(Job) private readonly jobs: Repository<Job>,
  ) {
    super(ai);
  }

  async run(ctx: AgentContext): Promise<AgentResult> {
    if (!ctx.profile) {
      return this.fail('Profile is required for job discovery');
    }

    const query =
      (ctx.input?.query as string | undefined) ??
      [
        ctx.profile.headline,
        ...(ctx.profile.filters.keywords ?? []),
        ...(ctx.profile.filters.skills ?? ctx.profile.skills ?? []),
      ]
        .filter(Boolean)
        .join(' ');

    const prompt = `Find jobs matching this profile and filters.

Profile headline: ${ctx.profile.headline ?? 'n/a'}
Skills: ${(ctx.profile.skills ?? []).join(', ') || 'n/a'}
Filters: ${JSON.stringify(ctx.profile.filters ?? {})}
Search focus: ${query || 'software engineering roles'}
Target companies: ${(ctx.profile.filters.targetCompanies ?? []).join(', ') || 'any'}

Return up to ${(ctx.input?.limit as number) ?? 5} strong matches as JSON array.`;

    try {
      const text = await this.think(prompt);
      const parsed = this.parseJson<DiscoveredJob[]>(text);
      if (!parsed?.length) {
        return this.ok('No jobs discovered', { jobs: [], raw: text });
      }

      const saved: Job[] = [];
      for (const item of parsed) {
        if (!item.title || !item.company || !item.description) continue;
        const job = this.jobs.create({
          userId: ctx.userId,
          title: item.title,
          company: item.company,
          location: item.location ?? null,
          remote: Boolean(item.remote ?? ctx.profile.filters.remoteOnly),
          source: item.source ?? 'discovery_agent',
          sourceUrl: item.sourceUrl ?? null,
          description: item.description,
          salaryMin: item.salaryMin ?? null,
          salaryMax: item.salaryMax ?? null,
          currency: item.currency ?? null,
          missingSkills: [],
          matchedSkills: [],
          metadata: { discoveredBy: this.id },
        });
        saved.push(await this.jobs.save(job));
      }

      return this.ok(`Discovered ${saved.length} job(s)`, {
        jobs: saved,
        jobIds: saved.map((j) => j.id),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(message);
      return this.fail(message);
    }
  }
}
