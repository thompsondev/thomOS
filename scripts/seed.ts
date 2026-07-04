/**
 * Seeds Postgres with the master user + resume profile.
 *
 * Only DATABASE_URL is required (how to reach the DB).
 * Resume/profile data lives in code, not in env.
 *
 * Usage: pnpm seed
 */
import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import {
  AgentRun,
  Application,
  Document,
  EmailMessage,
  Job,
  Profile,
  User,
} from '../src/lib/database/entities';
import {
  THOMPSON_USER_ID,
  thompsonOpeyemiProfile,
} from '../src/modules/profile/data/thompson-opeyemi.profile';

const DEFAULT_SEED_PASSWORD = 'ChangeMe123!';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required to seed the database');
  }

  const password =
    process.env.SEED_USER_PASSWORD?.trim() || DEFAULT_SEED_PASSWORD;

  const ds = new DataSource({
    type: 'postgres',
    url,
    entities: [
      User,
      Profile,
      Job,
      Application,
      Document,
      AgentRun,
      EmailMessage,
    ],
    synchronize: true,
  });

  await ds.initialize();
  console.log('Connected to database');

  const users = ds.getRepository(User);
  const profiles = ds.getRepository(Profile);

  const email = THOMPSON_USER_ID;
  const passwordHash = await bcrypt.hash(password, 10);

  let user = await users.findOne({ where: { email } });
  if (!user) {
    user = await users.save(
      users.create({
        id: email,
        email,
        passwordHash,
        fullName: 'Thompson Opeyemi Odunayo',
      }),
    );
    console.log(`Created user ${email}`);
  } else {
    user.passwordHash = passwordHash;
    user.fullName = user.fullName ?? 'Thompson Opeyemi Odunayo';
    user.email = email;
    await users.save(user);
    console.log(`Updated user ${email}`);
  }

  const dto = { ...thompsonOpeyemiProfile, userId: email };
  let profile = await profiles.findOne({ where: { userId: email } });
  if (!profile) {
    profile = profiles.create({
      userId: email,
      fullName: dto.fullName ?? null,
      headline: dto.headline ?? null,
      summary: dto.summary ?? null,
      phone: dto.phone ?? null,
      linkedinUrl: dto.linkedinUrl ?? null,
      masterResume: dto.masterResume ?? '',
      skills: dto.skills ?? [],
      filters: dto.filters ?? {},
      experience: dto.experience ?? [],
    });
  } else {
    profile.fullName = dto.fullName ?? profile.fullName;
    profile.headline = dto.headline ?? profile.headline;
    profile.summary = dto.summary ?? profile.summary;
    profile.phone = dto.phone ?? profile.phone;
    profile.linkedinUrl = dto.linkedinUrl ?? profile.linkedinUrl;
    profile.masterResume = dto.masterResume ?? profile.masterResume;
    profile.skills = dto.skills ?? profile.skills;
    profile.filters = dto.filters ?? profile.filters;
    profile.experience = dto.experience ?? profile.experience;
  }
  await profiles.save(profile);

  console.log(`Seeded profile for ${email}`);
  console.log(`  skills: ${profile.skills.length}`);
  console.log(`  experience roles: ${profile.experience.length}`);
  console.log(`  resume chars: ${profile.masterResume.length}`);
  console.log(`Login: ${email} / (SEED_USER_PASSWORD or default ChangeMe123!)`);

  await ds.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
