import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AgentRun,
  Application,
  Document,
  EmailMessage,
  Job,
  Profile,
  User,
} from './entities';

const entities = [
  User,
  Profile,
  Job,
  Application,
  Document,
  AgentRun,
  EmailMessage,
];

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('DATABASE_URL');
        if (!url) {
          throw new Error('DATABASE_URL is required');
        }

        const nodeEnv = config.get<string>('NODE_ENV') ?? 'development';
        const syncFlag = config.get<string>('TYPEORM_SYNC');
        const synchronize =
          syncFlag === 'true' ||
          (syncFlag !== 'false' && nodeEnv !== 'production');

        return {
          type: 'postgres' as const,
          url,
          autoLoadEntities: true,
          synchronize,
          logging: nodeEnv === 'development',
        };
      },
    }),
    TypeOrmModule.forFeature(entities),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
