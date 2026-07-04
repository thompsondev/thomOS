import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { AiModule } from './ai/ai.module';
import { PdfModule } from './pdf/pdf.module';
import { BrowserModule } from './browser/browser.module';

@Module({
  imports: [DatabaseModule, AiModule, PdfModule, BrowserModule],
})
export class LibModule {}
