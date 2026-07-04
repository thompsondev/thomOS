import { Injectable } from '@nestjs/common';
import { AgentId } from '../../../lib/database/entities';
import { AiService } from '../../../lib/ai/ai.service';
import { BaseAgent } from '../base/base.agent';
import type { AgentContext, AgentResult } from '../agents.types';

@Injectable()
export class CoachAgent extends BaseAgent {
  readonly id = AgentId.COACH;
  readonly name = 'Career Coach Agent';
  readonly responsibilities = [
    'Suggest profile and headline improvements',
    'Identify skill gaps worth closing',
    'Advise where to apply more or less',
    'Keep advice specific and reversible',
  ];

  protected readonly systemPrompt = `You are the Career Coach Agent for RemoteHask.
Give specific, evidence-based career advice.
Return ONLY valid JSON:
{
  "suggestions": string[],
  "skillGaps": string[],
  "headlineAdvice": string | null,
  "strategy": string
}`;

  constructor(ai: AiService) {
    super(ai);
  }

  async run(ctx: AgentContext): Promise<AgentResult> {
    if (!ctx.profile) {
      return this.fail('Profile is required for coaching');
    }

    const analytics = ctx.input?.analytics ?? null;
    const prompt = `Coach this candidate.

Profile:
Name: ${ctx.profile.fullName ?? 'n/a'}
Headline: ${ctx.profile.headline ?? 'n/a'}
Skills: ${(ctx.profile.skills ?? []).join(', ')}
Filters: ${JSON.stringify(ctx.profile.filters ?? {})}
Resume:
${ctx.profile.masterResume || ctx.profile.summary || 'n/a'}

Analytics context:
${JSON.stringify(analytics)}

Focus: ${(ctx.input?.focus as string) ?? 'overall job search strategy'}`;

    try {
      const text = await this.think(prompt);
      const parsed = this.parseJson<{
        suggestions: string[];
        skillGaps: string[];
        headlineAdvice: string | null;
        strategy: string;
      }>(text);

      if (!parsed) {
        return this.fail('Coach agent returned invalid JSON');
      }

      return this.ok('Coaching recommendations ready', parsed);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(message);
      return this.fail(message);
    }
  }
}
