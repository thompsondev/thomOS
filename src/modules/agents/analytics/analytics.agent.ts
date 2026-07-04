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

@Injectable()
export class AnalyticsAgent extends BaseAgent {
  readonly id = AgentId.ANALYTICS;
  readonly name = 'Analytics Agent';
  readonly responsibilities = [
    'Aggregate application funnel metrics',
    'Compute success rates by role type / company',
    'Surface patterns after enough applications',
  ];

  protected readonly systemPrompt = `You are the Analytics Agent for RemoteHask.
Turn application stats into clear insights.
Return ONLY valid JSON:
{
  "insights": string[],
  "recommendations": string[],
  "byCategory": Record<string, { total: number, successRate: number }>
}`;

  constructor(
    ai: AiService,
    @InjectRepository(Application)
    private readonly applications: Repository<Application>,
    @InjectRepository(Job) private readonly jobs: Repository<Job>,
  ) {
    super(ai);
  }

  async run(ctx: AgentContext): Promise<AgentResult> {
    try {
      const apps = await this.applications.find({
        where: { userId: ctx.userId },
      });
      const jobs = await this.jobs.find({ where: { userId: ctx.userId } });
      const jobMap = new Map(jobs.map((j) => [j.id, j]));

      const dashboard = {
        found: apps.filter((a) => a.status === ApplicationStatus.FOUND).length,
        applied: apps.filter((a) => a.status === ApplicationStatus.APPLIED)
          .length,
        waiting: apps.filter((a) => a.status === ApplicationStatus.WAITING)
          .length,
        interview: apps.filter((a) => a.status === ApplicationStatus.INTERVIEW)
          .length,
        rejected: apps.filter((a) => a.status === ApplicationStatus.REJECTED)
          .length,
        offer: apps.filter((a) => a.status === ApplicationStatus.OFFER).length,
        total: apps.length,
      };

      const rows = apps.map((a) => {
        const job = jobMap.get(a.jobId);
        return {
          status: a.status,
          matchScore: a.matchScore,
          title: job?.title,
          company: job?.company,
        };
      });

      const prompt = `Analyse this application funnel and produce insights.

Dashboard: ${JSON.stringify(dashboard)}
Applications: ${JSON.stringify(rows)}`;

      const text = await this.think(prompt);
      const parsed = this.parseJson<{
        insights: string[];
        recommendations: string[];
        byCategory: Record<string, { total: number; successRate: number }>;
      }>(text);

      return this.ok('Analytics ready', {
        dashboard,
        ...(parsed ?? {
          insights: [],
          recommendations: [],
          byCategory: {},
        }),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(message);
      return this.fail(message);
    }
  }
}
