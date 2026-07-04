import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ChatService } from './chat.service';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OpenAccessPromptLimitGuard } from '../../middleware/guards/open-access-prompt-limit.guard';

type StreamHistoryItem = { role: 'user' | 'assistant'; content: string };
type StreamAttachment = { name: string; mimeType: string; data: string };

@ApiTags('Chat')
@ApiBearerAuth('Authorization')
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('prompt')
  @UseGuards(OpenAccessPromptLimitGuard)
  @ApiOperation({ summary: 'Generate a response from the AI' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { prompt: { type: 'string' } },
    },
  })
  async generateResponse(@Body() body: { prompt: string }) {
    return this.chatService.generateResponse(body.prompt);
  }

  @Post('prompt/stream')
  @UseGuards(OpenAccessPromptLimitGuard)
  @ApiOperation({ summary: 'Stream a response from the AI (SSE)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        history: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              role: { type: 'string', enum: ['user', 'assistant'] },
              content: { type: 'string' },
            },
          },
        },
        attachments: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              mimeType: { type: 'string' },
              data: {
                type: 'string',
                description: 'Base64-encoded file content',
              },
            },
          },
        },
      },
    },
  })
  async streamResponse(
    @Body()
    body: {
      prompt: string;
      history?: StreamHistoryItem[];
      attachments?: StreamAttachment[];
    },
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const emit = (data: object) =>
      res.write(`data: ${JSON.stringify(data)}\n\n`);

    await this.chatService.handleStreamPrompt(
      body.prompt,
      emit,
      body.history,
      body.attachments,
    );

    res.end();
  }
}
