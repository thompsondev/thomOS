import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { AiModule } from './ai/ai.module';

@Module({
  imports: [DatabaseModule, AiModule],
})
export class LibModule {}
