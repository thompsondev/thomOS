import { Global, Module } from '@nestjs/common';
import { JobSourcesService } from './job-sources.service';

@Global()
@Module({
  providers: [JobSourcesService],
  exports: [JobSourcesService],
})
export class JobSourcesModule {}
