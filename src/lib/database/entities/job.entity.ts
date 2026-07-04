import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'Job' })
export class Job {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'text' })
  userId: string;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text' })
  company: string;

  @Column({ type: 'text', nullable: true })
  location: string | null;

  @Column({ type: 'boolean', default: false })
  remote: boolean;

  @Column({ type: 'text', nullable: true })
  source: string | null;

  @Column({ type: 'text', nullable: true })
  sourceUrl: string | null;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'int', nullable: true })
  salaryMin: number | null;

  @Column({ type: 'int', nullable: true })
  salaryMax: number | null;

  @Column({ type: 'text', nullable: true })
  currency: string | null;

  @Column({ type: 'float', nullable: true })
  matchScore: number | null;

  @Column({ type: 'jsonb', default: [] })
  missingSkills: string[];

  @Column({ type: 'jsonb', default: [] })
  matchedSkills: string[];

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
