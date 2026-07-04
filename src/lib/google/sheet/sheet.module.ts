import { Global, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { GoogleSheetsService } from './sheet.service';

@Global()
@Module({
  imports: [HttpModule],
  providers: [GoogleSheetsService],
  exports: [GoogleSheetsService],
})
export class SheetModule {}
