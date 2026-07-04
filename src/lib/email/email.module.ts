import { Global, Module } from '@nestjs/common';
import { GmailService } from './gmail.service';

@Global()
@Module({
  providers: [GmailService],
  exports: [GmailService],
})
export class EmailModule {}
