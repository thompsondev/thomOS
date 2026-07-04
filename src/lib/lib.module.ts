import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { AiModule } from './ai/ai.module';
import { PdfModule } from './pdf/pdf.module';
import { BrowserModule } from './browser/browser.module';
import { JobSourcesModule } from './job-sources/job-sources.module';
import { EmailModule } from './email/email.module';
import { CalendarModule } from './calendar/calendar.module';

@Module({
  imports: [
    DatabaseModule,
    AiModule,
    PdfModule,
    BrowserModule,
    JobSourcesModule,
    EmailModule,
    CalendarModule,
  ],
})
export class LibModule {}
