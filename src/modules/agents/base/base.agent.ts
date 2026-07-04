import { Logger } from '@nestjs/common';
import { AgentId } from '../../../lib/database/entities';
import { AiService } from '../../../lib/ai/ai.service';
import type {
  AgentContext,
  AgentDescriptor,
  AgentResult,
} from '../agents.types';

export abstract class BaseAgent {
  protected readonly logger: Logger;

  abstract readonly id: AgentId;
  abstract readonly name: string;
  abstract readonly responsibilities: string[];
  protected abstract readonly systemPrompt: string;

  constructor(protected readonly ai: AiService) {
    this.logger = new Logger(this.constructor.name);
  }

  describe(): AgentDescriptor {
    return {
      id: this.id,
      name: this.name,
      responsibilities: this.responsibilities,
    };
  }

  abstract run(ctx: AgentContext): Promise<AgentResult>;

  protected async think(prompt: string): Promise<string> {
    return this.ai.generateForAgent(this.systemPrompt, prompt);
  }

  protected ok<T>(summary: string, data?: T): AgentResult<T> {
    return { agentId: this.id, success: true, summary, data };
  }

  protected fail(error: string): AgentResult {
    return {
      agentId: this.id,
      success: false,
      summary: error,
      error,
    };
  }

  protected parseJson<T>(text: string): T | null {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const raw = (fenced?.[1] ?? text).trim();
    try {
      return JSON.parse(raw) as T;
    } catch {
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(raw.slice(start, end + 1)) as T;
        } catch {
          return null;
        }
      }
      const aStart = raw.indexOf('[');
      const aEnd = raw.lastIndexOf(']');
      if (aStart >= 0 && aEnd > aStart) {
        try {
          return JSON.parse(raw.slice(aStart, aEnd + 1)) as T;
        } catch {
          return null;
        }
      }
      return null;
    }
  }
}
