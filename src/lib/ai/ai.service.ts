import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Anthropic from '@anthropic-ai/sdk';
import type {
  MessageParam,
  ContentBlockParam,
} from '@anthropic-ai/sdk/resources/messages';

import { systemPrompt as SYSTEM_PROMPT } from './sp';
import {
  executeDatabaseTool,
  getDatabaseToolDefinition,
} from './tools/db.tool';
import { User } from '../database/entities';

const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-5-20250929';
const MAX_TOKENS = 8192;
const MAX_TOOL_ROUNDS = 5;

export type Attachment = {
  name: string;
  mimeType: string;
  /** base64-encoded file data */
  data: string;
};

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  attachments?: Attachment[];
};

export type StreamPart =
  | { type: 'text-delta'; text: string }
  | { type: 'tool-call'; toolName: string }
  | { type: 'tool-result'; toolName: string }
  | { type: 'finish'; finishReason: string }
  | { type: 'error'; error: unknown };

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client: Anthropic;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      this.logger.warn('ANTHROPIC_API_KEY is not set');
    }
    this.client = new Anthropic({ apiKey: apiKey ?? '' });
    this.logger.log(`Claude model activated: ${this.getModel()}`);
  }

  private getModel(): string {
    const env = this.configService.get<string>('AI_MODEL')?.trim();
    return env && env.length > 0 ? env : DEFAULT_CLAUDE_MODEL;
  }

  private buildClaudeMessages(messages: ChatMessage[]): MessageParam[] {
    return messages.map((msg) => {
      if (
        msg.role === 'user' &&
        msg.attachments &&
        msg.attachments.length > 0
      ) {
        const content: ContentBlockParam[] = [];
        for (const att of msg.attachments) {
          if (att.mimeType.startsWith('image/')) {
            content.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: att.mimeType as
                  | 'image/jpeg'
                  | 'image/png'
                  | 'image/gif'
                  | 'image/webp',
                data: att.data,
              },
            });
          } else if (
            att.mimeType.startsWith('text/') ||
            att.mimeType === 'application/json'
          ) {
            const text = Buffer.from(att.data, 'base64').toString('utf8');
            content.push({
              type: 'text',
              text: `Attached file "${att.name}":\n${text.slice(0, 20_000)}`,
            });
          } else {
            content.push({
              type: 'text',
              text: `[User attached file "${att.name}" (${att.mimeType}). Binary attachments other than images are not inlined.]`,
            });
          }
        }
        if (msg.content) {
          content.push({ type: 'text', text: msg.content });
        }
        return { role: 'user' as const, content };
      }
      return { role: msg.role, content: msg.content };
    });
  }

  private extractText(content: Anthropic.ContentBlock[]): string {
    return content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');
  }

  private async runTool(
    name: string,
    input: Record<string, unknown>,
  ): Promise<string> {
    if (name === 'database') {
      const result = await executeDatabaseTool(
        this.users,
        input as { intent?: string },
      );
      return JSON.stringify(result);
    }
    return JSON.stringify({ error: `Unknown tool: ${name}` });
  }

  async generateResponse(userPrompt: string): Promise<string> {
    return this.generateResponseWithHistory([
      { role: 'user', content: userPrompt },
    ]);
  }

  /** Agent-scoped generation with a custom system prompt (Claude only). */
  async generateForAgent(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<string> {
    const model = this.getModel();
    this.logger.log(`Agent model: ${model}`);

    const response = await this.client.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    return this.extractText(response.content);
  }

  async generateResponseWithHistory(messages: ChatMessage[]): Promise<string> {
    const model = this.getModel();
    this.logger.log(`Using model: ${model}`);

    const conversation: MessageParam[] = this.buildClaudeMessages(messages);
    const tools = [getDatabaseToolDefinition()];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await this.client.messages.create({
        model,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: conversation,
        tools,
      });

      const toolUses = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
      );

      if (toolUses.length === 0 || response.stop_reason === 'end_turn') {
        return this.extractText(response.content);
      }

      conversation.push({ role: 'assistant', content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUses) {
        const output = await this.runTool(
          toolUse.name,
          toolUse.input as Record<string, unknown>,
        );
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: output,
        });
      }
      conversation.push({ role: 'user', content: toolResults });
    }

    const fallback = await this.client.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: conversation,
    });
    return this.extractText(fallback.content);
  }

  streamResponseWithHistory(messages: ChatMessage[]): {
    fullStream: AsyncIterable<StreamPart>;
  } {
    const model = this.getModel();
    this.logger.log(`Using model: ${model}`);

    const self = this;
    const fullStream = (async function* (): AsyncGenerator<StreamPart> {
      try {
        const conversation: MessageParam[] = self.buildClaudeMessages(messages);
        const tools = [getDatabaseToolDefinition()];

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const stream = self.client.messages.stream({
            model,
            max_tokens: MAX_TOKENS,
            system: SYSTEM_PROMPT,
            messages: conversation,
            tools,
          });

          const toolUses: Anthropic.ToolUseBlock[] = [];
          let stopReason: string | null = null;

          for await (const event of stream) {
            if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'text_delta'
            ) {
              yield { type: 'text-delta', text: event.delta.text };
            }
            if (
              event.type === 'content_block_start' &&
              event.content_block.type === 'tool_use'
            ) {
              yield {
                type: 'tool-call',
                toolName: event.content_block.name,
              };
            }
            if (event.type === 'message_delta') {
              stopReason = event.delta.stop_reason ?? stopReason;
            }
          }

          const finalMessage = await stream.finalMessage();
          stopReason = finalMessage.stop_reason ?? stopReason;

          for (const block of finalMessage.content) {
            if (block.type === 'tool_use') {
              toolUses.push(block);
            }
          }

          if (toolUses.length === 0 || stopReason === 'end_turn') {
            yield { type: 'finish', finishReason: stopReason ?? 'end_turn' };
            return;
          }

          conversation.push({
            role: 'assistant',
            content: finalMessage.content,
          });

          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          for (const toolUse of toolUses) {
            const output = await self.runTool(
              toolUse.name,
              toolUse.input as Record<string, unknown>,
            );
            yield { type: 'tool-result', toolName: toolUse.name };
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: output,
            });
          }
          conversation.push({ role: 'user', content: toolResults });
        }

        yield { type: 'finish', finishReason: 'max_tool_rounds' };
      } catch (error: unknown) {
        yield { type: 'error', error };
      }
    })();

    return { fullStream };
  }
}
