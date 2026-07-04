import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LibModule } from '../lib/lib.module';
import { CustomLoggerService } from '../lib/loggger/logger.service';
import { V1Module } from '../modules/v1.module';
import { ApiKeyGuard } from '../middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    LibModule,
    V1Module,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    CustomLoggerService,
    { provide: APP_GUARD, useClass: ApiKeyGuard },
  ],
})
export class AppModule {}
