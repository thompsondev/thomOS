import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiService } from './ai.service';
import { User } from '../database/entities';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
