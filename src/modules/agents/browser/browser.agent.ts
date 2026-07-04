import { Injectable } from '@nestjs/common';
import { AgentId } from '../../../lib/database/entities';
import { AiService } from '../../../lib/ai/ai.service';
import { BaseAgent } from '../base/base.agent';
import type { AgentContext, AgentResult } from '../agents.types';

/**
 * Browser automation agent (Playwright).
 * Currently plans steps and pauses for approval; live automation comes next.
 */
@Injectable()
export class BrowserAgent extends BaseAgent {
  readonly id = AgentId.BROWSER;
  readonly name = 'Browser Automation Agent';
  readonly responsibilities = [
    'Plan Playwright steps for job-site applications',
    'Fill forms and upload documents when automation is enabled',
    'Pause for approval before final submit by default',
    'Respect CAPTCHAs, anti-bot limits, and site terms',
  ];

  protected readonly systemPrompt = `You are the Browser Automation Agent for RemoteHask.
Plan safe Playwright steps to apply on a job site.
Never invent credentials. Prefer approval before final submit.
Return ONLY valid JSON:
{
  "steps": string[],
  "canAutomate": boolean,
  "requiresApproval": boolean,
  "blockers": string[],
  "notes": string
}`;

  constructor(ai: AiService) {
    super(ai);
  }

  async run(ctx: AgentContext): Promise<AgentResult> {
    if (!ctx.job) {
      return this.fail('Job is required for browser automation planning');
    }

    const autoApproved = Boolean(ctx.application?.autoSubmitApproved);
    const prompt = `Plan browser automation for this application.

Company: ${ctx.job.company}
Role: ${ctx.job.title}
URL: ${ctx.job.sourceUrl ?? 'unknown'}
Source: ${ctx.job.source ?? 'unknown'}
Auto-submit approved: ${autoApproved}
Application answers: ${JSON.stringify(ctx.application?.answers ?? {})}

Playwright live execution is not enabled yet — produce a precise step plan only.`;

    try {
      const text = await this.think(prompt);
      const parsed = this.parseJson<{
        steps: string[];
        canAutomate: boolean;
        requiresApproval: boolean;
        blockers: string[];
        notes: string;
      }>(text);

      if (!parsed?.steps) {
        return this.ok('Browser plan unavailable; manual apply required', {
          executed: false,
          requiresApproval: true,
          steps: [],
          blockers: ['Could not parse automation plan'],
        });
      }

      return this.ok('Browser plan ready (execution pending approval)', {
        ...parsed,
        executed: false,
        requiresApproval: !autoApproved || parsed.requiresApproval !== false,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(message);
      return this.fail(message);
    }
  }
}
