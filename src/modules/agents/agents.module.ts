import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AgentRun,
  Application,
  Document,
  EmailMessage,
  Job,
  Profile,
} from '../../lib/database/entities';
import { AgentsController } from './agents.controller';
import { OrchestratorService } from './orchestrator/orchestrator.service';
import { DiscoveryAgent } from './discovery/discovery.agent';
import { MatchingAgent } from './matching/matching.agent';
import { ResumeAgent } from './resume/resume.agent';
import { CoverLetterAgent } from './cover-letter/cover-letter.agent';
import { CvReviewAgent } from './cv-review/cv-review.agent';
import { ApplicationAgent } from './application/application.agent';
import { BrowserAgent } from './browser/browser.agent';
import { EmailAgent } from './email/email.agent';
import { AnalyticsAgent } from './analytics/analytics.agent';
import { CoachAgent } from './coach/coach.agent';
import { InterviewPrepAgent } from './interview-prep/interview-prep.agent';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Profile,
      Job,
      Application,
      Document,
      AgentRun,
      EmailMessage,
    ]),
  ],
  controllers: [AgentsController],
  providers: [
    OrchestratorService,
    DiscoveryAgent,
    MatchingAgent,
    ResumeAgent,
    CoverLetterAgent,
    CvReviewAgent,
    ApplicationAgent,
    BrowserAgent,
    EmailAgent,
    AnalyticsAgent,
    CoachAgent,
    InterviewPrepAgent,
  ],
  exports: [OrchestratorService],
})
export class AgentsModule {}
