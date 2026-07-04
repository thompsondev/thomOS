import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chat/chat.module';
import { AgentsModule } from './agents/agents.module';
import { ProfileModule } from './profile/profile.module';
import { JobsModule } from './jobs/jobs.module';
import { ApplicationsModule } from './applications/applications.module';
import { EmailsModule } from './emails/emails.module';
import { SchedulerModule } from './scheduler/scheduler.module';

@Module({
  imports: [
    AuthModule,
    ChatModule,
    AgentsModule,
    ProfileModule,
    JobsModule,
    ApplicationsModule,
    EmailsModule,
    SchedulerModule,
  ],
  exports: [SchedulerModule],
})
export class V1Module {}
