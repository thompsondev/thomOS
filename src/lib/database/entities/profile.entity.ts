import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ProfileFilters = {
  remoteOnly?: boolean;
  minSalary?: number;
  seniority?: string[];
  skills?: string[];
  locations?: string[];
  visaSponsorship?: boolean;
  keywords?: string[];
  targetCompanies?: string[];
};

@Entity({ name: 'Profile' })
export class Profile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'text' })
  userId: string;

  @Column({ type: 'text', nullable: true })
  fullName: string | null;

  @Column({ type: 'text', nullable: true })
  headline: string | null;

  @Column({ type: 'text', nullable: true })
  summary: string | null;

  @Column({ type: 'text', nullable: true })
  phone: string | null;

  @Column({ type: 'text', nullable: true })
  linkedinUrl: string | null;

  /** Master resume in markdown/plain text — source of truth for all tailored docs */
  @Column({ type: 'text', default: '' })
  masterResume: string;

  @Column({ type: 'jsonb', default: [] })
  skills: string[];

  @Column({ type: 'jsonb', default: {} })
  filters: ProfileFilters;

  @Column({ type: 'jsonb', default: [] })
  experience: Array<{
    company?: string;
    title?: string;
    startDate?: string;
    endDate?: string;
    bullets?: string[];
  }>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
