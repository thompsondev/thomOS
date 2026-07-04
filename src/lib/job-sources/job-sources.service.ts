import { Injectable, Logger } from '@nestjs/common';
import type { ProfileFilters } from '../database/entities';
import type { JobSourceFetchOptions, RawJobListing } from './job-sources.types';

/** Public Greenhouse board tokens for common target companies */
const GREENHOUSE_BOARDS: Record<string, string> = {
  stripe: 'stripe',
  cloudflare: 'cloudflare',
  gitlab: 'gitlab',
  shopify: 'shopify',
  discord: 'discord',
  airbnb: 'airbnb',
  figma: 'figma',
  datadog: 'datadog',
  coinbase: 'coinbase',
  reddit: 'reddit',
};

/** Public Ashby board names */
const ASHBY_BOARDS: Record<string, string> = {
  anthropic: 'anthropic',
  openai: 'openai',
  vercel: 'vercel',
  linear: 'linear',
  cursor: 'cursor',
  notion: 'notion',
  ramp: 'ramp',
  brex: 'brex',
};

/** Public Lever company handles */
const LEVER_COMPANIES: Record<string, string> = {
  netflix: 'netflix',
  twilio: 'twilio',
  shopify: 'shopify',
};

@Injectable()
export class JobSourcesService {
  private readonly logger = new Logger(JobSourcesService.name);

  async fetchListings(
    options: JobSourceFetchOptions = {},
  ): Promise<RawJobListing[]> {
    const limitPerSource = options.limitPerSource ?? 40;
    const companies = (options.targetCompanies ?? []).map((c) =>
      c.toLowerCase().trim(),
    );

    const results = await Promise.allSettled([
      this.fetchRemoteOk(options, limitPerSource),
      this.fetchRemotive(options, limitPerSource),
      this.fetchArbeitnow(options, limitPerSource),
      this.fetchGreenhouseBoards(companies, limitPerSource),
      this.fetchAshbyBoards(companies, limitPerSource),
      this.fetchLeverCompanies(companies, limitPerSource),
    ]);

    const listings: RawJobListing[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        listings.push(...result.value);
      } else {
        this.logger.warn(`Job source failed: ${result.reason}`);
      }
    }

    return this.dedupe(listings);
  }

  prefilter(
    listings: RawJobListing[],
    filters: ProfileFilters,
    skills: string[],
  ): RawJobListing[] {
    const remoteOnly = Boolean(filters.remoteOnly);
    const minSalary = filters.minSalary;
    const needles = [
      ...(filters.keywords ?? []),
      ...(filters.skills ?? []),
      ...skills,
      ...(filters.seniority ?? []),
    ]
      .map((s) => s.toLowerCase())
      .filter(Boolean);

    return listings.filter((job) => {
      if (remoteOnly && job.remote === false) return false;
      if (
        minSalary != null &&
        job.salaryMax != null &&
        job.salaryMax < minSalary
      ) {
        return false;
      }
      if (!needles.length) return true;

      const haystack = [
        job.title,
        job.company,
        job.description,
        ...(job.tags ?? []),
      ]
        .join(' ')
        .toLowerCase();

      return needles.some((n) => haystack.includes(n));
    });
  }

  private dedupe(listings: RawJobListing[]): RawJobListing[] {
    const seen = new Set<string>();
    const out: RawJobListing[] = [];
    for (const job of listings) {
      const key = (job.sourceUrl || job.externalId).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(job);
    }
    return out;
  }

  private async fetchJson(url: string, init?: RequestInit): Promise<unknown> {
    const response = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'thomOS-JobDiscovery/1.0',
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      throw new Error(`${url} -> ${response.status}`);
    }
    return response.json();
  }

  private async fetchRemoteOk(
    options: JobSourceFetchOptions,
    limit: number,
  ): Promise<RawJobListing[]> {
    const data = (await this.fetchJson('https://remoteok.com/api')) as Array<
      Record<string, unknown>
    >;
    const rows = data.filter((row) => row && row.id && row.position);
    const needles = this.buildNeedles(options);

    return rows
      .filter((row) => this.matchesNeedles(needles, row))
      .slice(0, limit)
      .map((row) => {
        const id = String(row.id);
        const tags = Array.isArray(row.tags) ? row.tags.map(String) : undefined;
        return {
          externalId: `remoteok:${id}`,
          title: String(row.position),
          company: String(row.company ?? 'Unknown'),
          location: row.location ? String(row.location) : 'Remote',
          remote: true,
          source: 'remoteok',
          sourceUrl: row.url
            ? String(row.url)
            : `https://remoteok.com/remote-jobs/${id}`,
          description: String(row.description ?? row.position ?? ''),
          salaryMin:
            typeof row.salary_min === 'number' ? row.salary_min : undefined,
          salaryMax:
            typeof row.salary_max === 'number' ? row.salary_max : undefined,
          currency: 'USD',
          tags,
        } satisfies RawJobListing;
      });
  }

  private async fetchRemotive(
    options: JobSourceFetchOptions,
    limit: number,
  ): Promise<RawJobListing[]> {
    const search = encodeURIComponent(
      options.query ||
        options.keywords?.[0] ||
        options.skills?.[0] ||
        'frontend',
    );
    const data = (await this.fetchJson(
      `https://remotive.com/api/remote-jobs?search=${search}&limit=${limit}`,
    )) as { jobs?: Array<Record<string, unknown>> };

    return (data.jobs ?? []).slice(0, limit).map((row) => {
      const id = String(row.id);
      return {
        externalId: `remotive:${id}`,
        title: String(row.title ?? ''),
        company: String(row.company_name ?? 'Unknown'),
        location: row.candidate_required_location
          ? String(row.candidate_required_location)
          : 'Remote',
        remote: true,
        source: 'remotive',
        sourceUrl: String(row.url ?? ''),
        description: String(row.description ?? row.title ?? ''),
        salaryMin: undefined,
        salaryMax: undefined,
        currency: undefined,
        tags: Array.isArray(row.tags) ? row.tags.map(String) : undefined,
      } satisfies RawJobListing;
    });
  }

  private async fetchArbeitnow(
    options: JobSourceFetchOptions,
    limit: number,
  ): Promise<RawJobListing[]> {
    const data = (await this.fetchJson(
      'https://www.arbeitnow.com/api/job-board-api',
    )) as { data?: Array<Record<string, unknown>> };

    const needles = this.buildNeedles(options);
    return (data.data ?? [])
      .filter((row) => this.matchesNeedles(needles, row))
      .slice(0, limit)
      .map((row) => {
        const slug = String(row.slug ?? row.url ?? Math.random());
        return {
          externalId: `arbeitnow:${slug}`,
          title: String(row.title ?? ''),
          company: String(row.company_name ?? 'Unknown'),
          location: row.location ? String(row.location) : undefined,
          remote: Boolean(row.remote),
          source: 'arbeitnow',
          sourceUrl: String(row.url ?? ''),
          description: String(row.description ?? row.title ?? ''),
          tags: Array.isArray(row.tags) ? row.tags.map(String) : undefined,
        } satisfies RawJobListing;
      });
  }

  private async fetchGreenhouseBoards(
    companies: string[],
    limit: number,
  ): Promise<RawJobListing[]> {
    const boards = this.resolveBoards(companies, GREENHOUSE_BOARDS);
    if (!boards.length) return [];

    const listings: RawJobListing[] = [];
    for (const [company, token] of boards) {
      try {
        const data = (await this.fetchJson(
          `https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`,
        )) as { jobs?: Array<Record<string, unknown>> };

        for (const row of (data.jobs ?? []).slice(0, limit)) {
          const id = String(row.id);
          const location =
            row.location && typeof row.location === 'object'
              ? String((row.location as { name?: string }).name ?? '')
              : undefined;
          listings.push({
            externalId: `greenhouse:${token}:${id}`,
            title: String(row.title ?? ''),
            company,
            location,
            remote: /remote/i.test(location ?? ''),
            source: 'greenhouse',
            sourceUrl:
              String(row.absolute_url ?? '') ||
              `https://boards.greenhouse.io/${token}/jobs/${id}`,
            description: String(row.content ?? row.title ?? ''),
          });
        }
      } catch (err: unknown) {
        this.logger.warn(
          `Greenhouse ${token}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return listings;
  }

  private async fetchAshbyBoards(
    companies: string[],
    limit: number,
  ): Promise<RawJobListing[]> {
    const boards = this.resolveBoards(companies, ASHBY_BOARDS);
    if (!boards.length) return [];

    const listings: RawJobListing[] = [];
    for (const [company, board] of boards) {
      try {
        const data = (await this.fetchJson(
          `https://api.ashbyhq.com/posting-api/job-board/${board}?includeCompensation=true`,
        )) as { jobs?: Array<Record<string, unknown>> };

        for (const row of (data.jobs ?? []).slice(0, limit)) {
          const id = String(row.id ?? row.jobUrl ?? row.title);
          const location = row.location ? String(row.location) : undefined;
          listings.push({
            externalId: `ashby:${board}:${id}`,
            title: String(row.title ?? ''),
            company,
            location,
            remote: Boolean(row.isRemote) || /remote/i.test(location ?? ''),
            source: 'ashby',
            sourceUrl: String(row.jobUrl ?? row.applyUrl ?? ''),
            description: String(
              row.descriptionPlain ?? row.descriptionHtml ?? row.title ?? '',
            ),
          });
        }
      } catch (err: unknown) {
        this.logger.warn(
          `Ashby ${board}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return listings;
  }

  private async fetchLeverCompanies(
    companies: string[],
    limit: number,
  ): Promise<RawJobListing[]> {
    const boards = this.resolveBoards(companies, LEVER_COMPANIES);
    if (!boards.length) return [];

    const listings: RawJobListing[] = [];
    for (const [company, handle] of boards) {
      try {
        const data = (await this.fetchJson(
          `https://api.lever.co/v0/postings/${handle}?mode=json`,
        )) as Array<Record<string, unknown>>;

        for (const row of (data ?? []).slice(0, limit)) {
          const id = String(row.id);
          const categories = (row.categories ?? {}) as Record<string, string>;
          const location = categories.location;
          listings.push({
            externalId: `lever:${handle}:${id}`,
            title: String(row.text ?? ''),
            company,
            location,
            remote: /remote/i.test(location ?? ''),
            source: 'lever',
            sourceUrl: String(row.hostedUrl ?? row.applyUrl ?? ''),
            description: String(
              (row.descriptionPlain ?? row.description ?? row.text) || '',
            ),
          });
        }
      } catch (err: unknown) {
        this.logger.warn(
          `Lever ${handle}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return listings;
  }

  private resolveBoards(
    companies: string[],
    map: Record<string, string>,
  ): Array<[string, string]> {
    if (!companies.length) {
      return Object.entries(map).slice(0, 6);
    }
    const out: Array<[string, string]> = [];
    for (const company of companies) {
      const key = company.toLowerCase().replace(/\s+/g, '');
      const token = map[key] ?? map[company.toLowerCase()];
      if (token) out.push([company, token]);
    }
    return out;
  }

  private buildNeedles(options: JobSourceFetchOptions): string[] {
    return [
      options.query,
      ...(options.keywords ?? []),
      ...(options.skills ?? []),
    ]
      .map((s) => s?.toLowerCase().trim())
      .filter((s): s is string => Boolean(s));
  }

  private matchesNeedles(
    needles: string[],
    row: Record<string, unknown>,
  ): boolean {
    if (!needles.length) return true;
    const haystack = JSON.stringify(row).toLowerCase();
    return needles.some((n) => haystack.includes(n));
  }
}
