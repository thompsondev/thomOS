import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AgentId,
  AgentRun,
  AgentRunStatus,
  Application,
  Job,
  Profile,
} from '../../../lib/database/entities';
import { BaseAgent } from '../base/base.agent';
import { DiscoveryAgent } from '../discovery/discovery.agent';
import { MatchingAgent } from '../matching/matching.agent';
import { ResumeAgent } from '../resume/resume.agent';
import { CoverLetterAgent } from '../cover-letter/cover-letter.agent';
import { ApplicationAgent } from '../application/application.agent';
import { BrowserAgent } from '../browser/browser.agent';
import { EmailAgent } from '../email/email.agent';
import { AnalyticsAgent } from '../analytics/analytics.agent';
import { CoachAgent } from '../coach/coach.agent';
import { InterviewPrepAgent } from '../interview-prep/interview-prep.agent';
import type {
  AgentContext,
  AgentDescriptor,
  AgentResult,
  PipelineResult,
} from '../agents.types';

@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);
  private readonly agents: Map<AgentId, BaseAgent>;

  constructor(
    private readonly discovery: DiscoveryAgent,
    private readonly matching: MatchingAgent,
    private readonly resume: ResumeAgent,
    private readonly coverLetter: CoverLetterAgent,
    private readonly application: ApplicationAgent,
    private readonly browser: BrowserAgent,
    private readonly email: EmailAgent,
    private readonly analytics: AnalyticsAgent,
    private readonly coach: CoachAgent,
    private readonly interviewPrep: InterviewPrepAgent,
    @InjectRepository(Profile)
    private readonly profiles: Repository<Profile>,
    @InjectRepository(Job)
    private readonly jobs: Repository<Job>,
    @InjectRepository(Application)
    private readonly applications: Repository<Application>,
    @InjectRepository(AgentRun)
    private readonly agentRuns: Repository<AgentRun>,
  ) {
    const list: BaseAgent[] = [
      discovery,
      matching,
      resume,
      coverLetter,
      application,
      browser,
      email,
      analytics,
      coach,
      interviewPrep,
    ];
    this.agents = new Map(list.map((a) => [a.id, a]));
  }

  listAgents(): AgentDescriptor[] {
    return [...this.agents.values()].map((a) => a.describe());
  }

  async runAgent(
    agentId: AgentId,
    userId: string,
    options?: {
      jobId?: string;
      applicationId?: string;
      input?: Record<string, unknown>;
    },
  ): Promise<AgentResult> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new NotFoundException(`Unknown agent: ${agentId}`);
    }

    const ctx = await this.buildContext(userId, options);
    return this.execute(agent, ctx);
  }

  /** Discover jobs → match each against profile */
  async runDiscoveryPipeline(
    userId: string,
    input?: Record<string, unknown>,
  ): Promise<PipelineResult> {
    const steps: AgentResult[] = [];
    const discoveryResult = await this.runAgent(AgentId.DISCOVERY, userId, {
      input,
    });
    steps.push(discoveryResult);

    const jobIds =
      (discoveryResult.data as { jobIds?: string[] } | undefined)?.jobIds ?? [];

    for (const jobId of jobIds) {
      const match = await this.runAgent(AgentId.MATCHING, userId, { jobId });
      steps.push(match);
    }

    return { pipeline: 'discover', steps, jobIds };
  }

  /**
   * Documents only: tailored CV + cover letter from master profile experience.
   */
  async runDocumentsPipeline(
    userId: string,
    jobId: string,
  ): Promise<PipelineResult> {
    const steps: AgentResult[] = [];

    const resume = await this.runAgent(AgentId.RESUME, userId, { jobId });
    steps.push(resume);

    const cover = await this.runAgent(AgentId.COVER_LETTER, userId, { jobId });
    steps.push(cover);

    return { pipeline: 'documents', steps, jobIds: [jobId] };
  }

  /**
   * Full apply prep pipeline for one job:
   * match → resume → cover letter → application answers → browser plan
   */
  async runApplyPipeline(
    userId: string,
    jobId: string,
    input?: Record<string, unknown>,
  ): Promise<PipelineResult> {
    const steps: AgentResult[] = [];
    let applicationId: string | undefined;

    const match = await this.runAgent(AgentId.MATCHING, userId, {
      jobId,
      input,
    });
    steps.push(match);
    applicationId = (match.data as { applicationId?: string } | undefined)
      ?.applicationId;

    const resume = await this.runAgent(AgentId.RESUME, userId, {
      jobId,
      applicationId,
      input,
    });
    steps.push(resume);

    const cover = await this.runAgent(AgentId.COVER_LETTER, userId, {
      jobId,
      applicationId,
      input,
    });
    steps.push(cover);

    const application = await this.runAgent(AgentId.APPLICATION, userId, {
      jobId,
      applicationId,
      input,
    });
    steps.push(application);
    applicationId =
      (application.data as { applicationId?: string } | undefined)
        ?.applicationId ?? applicationId;

    const browser = await this.runAgent(AgentId.BROWSER, userId, {
      jobId,
      applicationId,
      input,
    });
    steps.push(browser);

    return { pipeline: 'apply', steps, applicationId, jobIds: [jobId] };
  }

  /** Analytics → coach */
  async runInsightsPipeline(userId: string): Promise<PipelineResult> {
    const steps: AgentResult[] = [];
    const analytics = await this.runAgent(AgentId.ANALYTICS, userId);
    steps.push(analytics);

    const coach = await this.runAgent(AgentId.COACH, userId, {
      input: { analytics: analytics.data },
    });
    steps.push(coach);

    return { pipeline: 'insights', steps };
  }

  /** Focused prep pack for one upcoming interview */
  async runInterviewPrepPipeline(
    userId: string,
    jobId: string,
    options?: {
      applicationId?: string;
      emailId?: string;
      input?: Record<string, unknown>;
    },
  ): Promise<PipelineResult> {
    const steps: AgentResult[] = [];
    const prep = await this.runAgent(AgentId.INTERVIEW_PREP, userId, {
      jobId,
      applicationId: options?.applicationId,
      input: {
        ...options?.input,
        emailId: options?.emailId,
      },
    });
    steps.push(prep);

    return {
      pipeline: 'interview_prep',
      steps,
      applicationId: options?.applicationId,
      jobIds: [jobId],
    };
  }

  private async buildContext(
    userId: string,
    options?: {
      jobId?: string;
      applicationId?: string;
      input?: Record<string, unknown>;
    },
  ): Promise<AgentContext> {
    const profile = await this.profiles.findOne({ where: { userId } });
    const job = options?.jobId
      ? await this.jobs.findOne({ where: { id: options.jobId, userId } })
      : null;
    const application = options?.applicationId
      ? await this.applications.findOne({
          where: { id: options.applicationId, userId },
        })
      : job
        ? await this.applications.findOne({
            where: { jobId: job.id, userId },
          })
        : null;

    return {
      userId,
      profile,
      job,
      application,
      input: options?.input,
    };
  }

  private async execute(
    agent: BaseAgent,
    ctx: AgentContext,
  ): Promise<AgentResult> {
    const run = await this.agentRuns.save(
      this.agentRuns.create({
        userId: ctx.userId,
        agentId: agent.id,
        status: AgentRunStatus.RUNNING,
        jobId: ctx.job?.id ?? null,
        applicationId: ctx.application?.id ?? null,
        input: ctx.input ?? {},
        output: {},
      }),
    );

    this.logger.log(`Running agent ${agent.id} for user ${ctx.userId}`);

    try {
      const result = await agent.run(ctx);
      run.status = result.success
        ? AgentRunStatus.COMPLETED
        : AgentRunStatus.FAILED;
      run.summary = result.summary;
      run.error = result.error ?? null;
      run.output = (result.data as Record<string, unknown>) ?? {};
      if (result.data && typeof result.data === 'object') {
        const data = result.data as Record<string, unknown>;
        if (typeof data.applicationId === 'string') {
          run.applicationId = data.applicationId;
        }
        if (typeof data.jobId === 'string') {
          run.jobId = data.jobId;
        }
      }
      await this.agentRuns.save(run);
      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      run.status = AgentRunStatus.FAILED;
      run.error = message;
      run.summary = message;
      await this.agentRuns.save(run);
      return {
        agentId: agent.id,
        success: false,
        summary: message,
        error: message,
      };
    }
  }
}
