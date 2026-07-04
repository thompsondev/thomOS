import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Application,
  Document,
  EmailMessage,
  Job,
  Profile,
} from '../../lib/database/entities';
import { AgentsModule } from '../agents/agents.module';
import { EmailsController } from './emails.controller';
import { EmailsService } from './emails.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EmailMessage,
      Application,
      Job,
      Document,
      Profile,
    ]),
    AgentsModule,
  ],
  controllers: [EmailsController],
  providers: [EmailsService],
  exports: [EmailsService],
})
export class EmailsModule {}
