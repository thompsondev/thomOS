import {
  ConflictException,
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { DataSource, Repository } from 'typeorm';
import { User } from '../../lib/database/entities';
import { THOMPSON_USER_ID } from '../profile/data/thompson-opeyemi.profile';
import { ProfileService } from '../profile/profile.service';
import type { AuthResponse, LoginDto, RegisterDto } from './auth.types';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private readonly expiresIn: string;

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly profiles: ProfileService,
  ) {
    this.expiresIn = this.config.get<string>('JWT_EXPIRES_IN') || '7d';
  }

  async onModuleInit() {
    await this.migrateLegacyThompsonIdentity();
    await this.ensureSeedUser();
  }

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const email = this.normalizeEmail(dto.email);
    const existing = await this.users.findOne({ where: { email } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.users.save(
      this.users.create({
        id: email,
        email,
        passwordHash,
        fullName: dto.fullName?.trim() || null,
      }),
    );

    if (email === THOMPSON_USER_ID) {
      await this.profiles.seedThompsonProfileForUser(email);
    }

    return this.toAuthResponse(user);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const email = this.normalizeEmail(dto.email);
    const user = await this.users.findOne({ where: { email } });
    if (!user?.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.toAuthResponse(user);
  }

  async me(userId: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      createdAt: user.createdAt,
    };
  }

  private async migrateLegacyThompsonIdentity() {
    const legacyId = 'Topeyemi33@gmail.com';
    const email = THOMPSON_USER_ID;

    const legacyUser = await this.users.findOne({ where: { id: legacyId } });
    const modernUser = await this.users.findOne({ where: { id: email } });
    if (legacyUser && !modernUser) {
      await this.users.save(
        this.users.create({
          id: email,
          email,
          passwordHash: legacyUser.passwordHash,
          fullName: legacyUser.fullName ?? 'Thompson Opeyemi Odunayo',
        }),
      );
      await this.users.delete({ id: legacyId });
      this.logger.log(`Migrated auth user ${legacyId} -> ${email}`);
    }

    // Profile.userId is unique — drop legacy row if modern already exists
    await this.dataSource.query(
      `DELETE FROM "Profile" WHERE "userId" = $1 AND EXISTS (SELECT 1 FROM "Profile" p2 WHERE p2."userId" = $2)`,
      [legacyId, email],
    );
    await this.dataSource.query(
      `UPDATE "Profile" SET "userId" = $1 WHERE "userId" = $2`,
      [email, legacyId],
    );

    for (const table of ['Job', 'Application', 'Document', 'AgentRun']) {
      await this.dataSource.query(
        `UPDATE "${table}" SET "userId" = $1 WHERE "userId" = $2`,
        [email, legacyId],
      );
    }

    // Fix earlier typo migration (topeymi33 -> topeyemi33)
    const typoId = 'topeymi33@gmail.com';
    await this.dataSource.query(
      `DELETE FROM "Profile" WHERE "userId" = $1 AND EXISTS (SELECT 1 FROM "Profile" p2 WHERE p2."userId" = $2)`,
      [typoId, email],
    );
    await this.dataSource.query(
      `UPDATE "Profile" SET "userId" = $1 WHERE "userId" = $2`,
      [email, typoId],
    );
    for (const table of ['Job', 'Application', 'Document', 'AgentRun']) {
      await this.dataSource.query(
        `UPDATE "${table}" SET "userId" = $1 WHERE "userId" = $2`,
        [email, typoId],
      );
    }
    const typoUser = await this.users.findOne({ where: { id: typoId } });
    const correctUser = await this.users.findOne({ where: { id: email } });
    if (typoUser && !correctUser) {
      await this.users.save(
        this.users.create({
          id: email,
          email,
          passwordHash: typoUser.passwordHash,
          fullName: typoUser.fullName,
        }),
      );
      await this.users.delete({ id: typoId });
    } else if (typoUser && correctUser) {
      await this.users.delete({ id: typoId });
    }
  }

  private async ensureSeedUser() {
    const email = THOMPSON_USER_ID;
    const password =
      this.config.get<string>('SEED_USER_PASSWORD')?.trim() || 'ChangeMe123!';

    const passwordHash = await bcrypt.hash(password, 10);
    let user = await this.users.findOne({ where: { email } });
    if (!user) {
      user = await this.users.save(
        this.users.create({
          id: email,
          email,
          passwordHash,
          fullName: 'Thompson Opeyemi Odunayo',
        }),
      );
      this.logger.log(`Seeded auth user ${email}`);
    } else {
      // Keep seed account password in sync with SEED_USER_PASSWORD outside production
      const isProd = this.config.get<string>('NODE_ENV') === 'production';
      if (!user.passwordHash || !isProd) {
        user.passwordHash = passwordHash;
        user.fullName = user.fullName ?? 'Thompson Opeyemi Odunayo';
        user.email = email;
        await this.users.save(user);
        this.logger.log(`Refreshed seed credentials for ${email}`);
      }
    }

    await this.profiles.seedThompsonProfileForUser(email);
  }

  private toAuthResponse(user: User): AuthResponse {
    const accessToken = this.jwt.sign({
      sub: user.id,
      email: user.email,
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.expiresIn,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
      },
    };
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }
}
