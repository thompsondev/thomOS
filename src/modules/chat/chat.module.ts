import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { OpenAccessPromptLimitGuard } from '../../middleware/guards/open-access-prompt-limit.guard';

@Module({
  controllers: [ChatController],
  providers: [ChatService, OpenAccessPromptLimitGuard],
})
export class ChatModule {}
