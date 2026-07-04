import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Profile } from '../../lib/database/entities';
import { AgentsModule } from '../agents/agents.module';
import { EmailsModule } from '../emails/emails.module';
import { AgentSchedulerService } from './agent-scheduler.service';
import { SchedulerController } from './scheduler.controller';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([Profile]),
    AgentsModule,
    EmailsModule,
  ],
  controllers: [SchedulerController],
  providers: [AgentSchedulerService],
  exports: [AgentSchedulerService],
})
export class SchedulerModule {}
