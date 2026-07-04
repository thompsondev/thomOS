import { Injectable, Logger } from '@nestjs/common';
import { AiService, ChatMessage, Attachment } from '../../lib/ai/ai.service';

const HISTORY_LIMIT = 20;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(private readonly aiService: AiService) {}

  async generateResponse(prompt: string): Promise<string> {
    return this.aiService.generateResponse(prompt);
  }

  async handleStreamPrompt(
    prompt: string,
    emit: (data: object) => void,
    history?: ChatMessage[],
    attachments?: Attachment[],
  ): Promise<void> {
    const userMessage: ChatMessage = { role: 'user', content: prompt };
    if (attachments?.length) userMessage.attachments = attachments;

    const messages: ChatMessage[] = [
      ...(history ?? []).slice(-HISTORY_LIMIT),
      userMessage,
    ];
    const { fullStream } = this.aiService.streamResponseWithHistory(messages);

    let textDeltaCount = 0;
    try {
      for await (const part of fullStream) {
        switch (part.type) {
          case 'text-delta':
            textDeltaCount++;
            emit({ t: 'text', v: part.text });
            break;
          case 'tool-call':
            this.logger.log(`Tool call: ${part.toolName}`);
            emit({ t: 'tool_call', tool: part.toolName });
            break;
          case 'tool-result':
            this.logger.log(`Tool result: ${part.toolName}`);
            emit({ t: 'tool_result', tool: part.toolName });
            break;
          case 'finish':
            this.logger.log(
              `Stream finished — text deltas: ${textDeltaCount}, reason: ${part.finishReason}`,
            );
            emit({ t: 'done' });
            break;
          case 'error':
            this.logger.error(
              `Stream error event: ${JSON.stringify(part.error)}`,
            );
            emit({
              t: 'error',
              msg:
                part.error instanceof Error
                  ? part.error.message
                  : 'Stream error',
            });
            break;
          default: {
            const _exhaustive: never = part;
            void _exhaustive;
            break;
          }
        }
      }
      if (textDeltaCount === 0) {
        this.logger.warn(
          'Stream finished with no text from the model. Check ANTHROPIC_API_KEY and AI_MODEL.',
        );
      }
    } catch (err: unknown) {
      const normalized = err as {
        message?: string;
        stack?: string;
        cause?: { message?: string; responseBody?: unknown };
      };
      this.logger.error('Stream error', normalized.stack ?? String(err));

      const msg =
        normalized.message ??
        normalized.cause?.message ??
        (typeof normalized.cause?.responseBody === 'string'
          ? normalized.cause.responseBody
          : null) ??
        'Stream error';
      emit({ t: 'error', msg });
    }
  }
}
