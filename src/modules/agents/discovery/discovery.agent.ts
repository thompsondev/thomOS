import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentId, Job } from '../../../lib/database/entities';
import { AiService } from '../../../lib/ai/ai.service';
import { JobSourcesService } from '../../../lib/job-sources/job-sources.service';
import type { RawJobListing } from '../../../lib/job-sources/job-sources.types';
import { BaseAgent } from '../base/base.agent';
import type { AgentContext, AgentResult } from '../agents.types';

@Injectable()
export class DiscoveryAgent extends BaseAgent {
  readonly id = AgentId.DISCOVERY;
  readonly name = 'Job Discovery Agent';
  readonly responsibilities = [
    'Fetch live listings from RemoteOK, Remotive, Arbeitnow, Greenhouse, Ashby, Lever',
    'Pre-filter by profile skills, keywords, remote, and salary',
    'Rank real listings with Claude — never invent jobs',
    'Persist selected jobs for matching and apply pipelines',
  ];

  protected readonly systemPrompt = `You are the Job Discovery Agent for RemoteHask.
You ONLY rank and select from REAL job listings provided in the user message.
Never invent employers, titles, or URLs.
Return ONLY valid JSON:
{
  "selectedExternalIds": string[],
  "reasons": { "<externalId>": "short reason" }
}
selectedExternalIds must be a subset of the provided listing ids.
Prefer senior/lead frontend, AI/automation, NestJS/React/TypeScript fit when relevant.
Prefer quality over quantity.`;

  constructor(
    ai: AiService,
    private readonly jobSources: JobSourcesService,
    @InjectRepository(Job) private readonly jobs: Repository<Job>,
  ) {
    super(ai);
  }

  async run(ctx: AgentContext): Promise<AgentResult> {
    if (!ctx.profile) {
      return this.fail('Profile is required for job discovery');
    }

    const limit = Math.min(20, Math.max(1, Number(ctx.input?.limit ?? 8) || 8));
    const query =
      (ctx.input?.query as string | undefined) ??
      [
        ...(ctx.profile.filters.keywords ?? []),
        ...(ctx.profile.filters.skills ?? []),
      ]
        .filter(Boolean)
        .slice(0, 4)
        .join(' ');

    try {
      const fetched = await this.jobSources.fetchListings({
        query,
        skills: ctx.profile.skills,
        keywords: ctx.profile.filters.keywords,
        targetCompanies: ctx.profile.filters.targetCompanies,
        remoteOnly: ctx.profile.filters.remoteOnly,
        limitPerSource: 35,
      });

      const filtered = this.jobSources.prefilter(
        fetched,
        ctx.profile.filters ?? {},
        ctx.profile.skills ?? [],
      );

      if (!filtered.length) {
        return this.ok('No live listings matched your filters', {
          jobs: [],
          jobIds: [],
          fetched: fetched.length,
          filtered: 0,
          sources: this.sourceCounts(fetched),
        });
      }

      const candidates = filtered.slice(0, 40);
      const compact = candidates.map((job) => ({
        externalId: job.externalId,
        title: job.title,
        company: job.company,
        location: job.location,
        remote: job.remote,
        source: job.source,
        sourceUrl: job.sourceUrl,
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        snippet: job.description.replace(/<[^>]+>/g, ' ').slice(0, 400),
      }));

      const prompt = `Select up to ${limit} best roles for this candidate from REAL listings only.

Profile headline: ${ctx.profile.headline ?? 'n/a'}
Skills: ${(ctx.profile.skills ?? []).slice(0, 30).join(', ')}
Filters: ${JSON.stringify(ctx.profile.filters ?? {})}
Search focus: ${query || 'software engineering'}

Listings:
${JSON.stringify(compact)}`;

      const text = await this.think(prompt);
      const parsed = this.parseJson<{
        selectedExternalIds: string[];
        reasons?: Record<string, string>;
      }>(text);

      const byId = new Map(candidates.map((j) => [j.externalId, j]));
      const selectedIds = (parsed?.selectedExternalIds ?? [])
        .filter((id) => byId.has(id))
        .slice(0, limit);

      // Fallback: if Claude returns nothing valid, take top prefiltered listings
      const chosen: RawJobListing[] = (
        selectedIds.length
          ? selectedIds.map((id) => byId.get(id)!)
          : candidates.slice(0, limit)
      ).filter(Boolean);

      const existing = await this.jobs.find({
        where: { userId: ctx.userId },
        select: { sourceUrl: true },
      });
      const existingUrls = new Set(
        existing.map((j) => (j.sourceUrl ?? '').toLowerCase()).filter(Boolean),
      );

      const saved: Job[] = [];
      for (const item of chosen) {
        if (!item.title || !item.company || !item.sourceUrl) continue;
        if (existingUrls.has(item.sourceUrl.toLowerCase())) continue;

        const job = this.jobs.create({
          userId: ctx.userId,
          title: item.title,
          company: item.company,
          location: item.location ?? null,
          remote: Boolean(item.remote ?? ctx.profile.filters.remoteOnly),
          source: item.source,
          sourceUrl: item.sourceUrl,
          description: item.description.slice(0, 20_000),
          salaryMin: item.salaryMin ?? null,
          salaryMax: item.salaryMax ?? null,
          currency: item.currency ?? null,
          missingSkills: [],
          matchedSkills: [],
          metadata: {
            discoveredBy: this.id,
            externalId: item.externalId,
            reason: parsed?.reasons?.[item.externalId] ?? null,
            tags: item.tags ?? [],
          },
        });
        saved.push(await this.jobs.save(job));
        existingUrls.add(item.sourceUrl.toLowerCase());
      }

      return this.ok(`Discovered ${saved.length} live job(s)`, {
        jobs: saved,
        jobIds: saved.map((j) => j.id),
        fetched: fetched.length,
        filtered: filtered.length,
        ranked: chosen.length,
        sources: this.sourceCounts(fetched),
        reasons: parsed?.reasons ?? {},
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(message);
      return this.fail(message);
    }
  }

  private sourceCounts(listings: RawJobListing[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const job of listings) {
      counts[job.source] = (counts[job.source] ?? 0) + 1;
    }
    return counts;
  }
}
