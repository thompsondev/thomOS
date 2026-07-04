import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ApplicationStatus } from './enums';

export type EmailCategory =
  | 'interview'
  | 'rejection'
  | 'offer'
  | 'assessment'
  | 'recruiter'
  | 'other';

@Entity({ name: 'EmailMessage' })
export class EmailMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'text' })
  userId: string;

  @Column({ type: 'text', nullable: true })
  fromAddress: string | null;

  @Column({ type: 'text', nullable: true })
  subject: string | null;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'text', nullable: true })
  category: EmailCategory | null;

  @Column({ type: 'text', nullable: true })
  summary: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  interviewAt: Date | null;

  @Column({ type: 'text', nullable: true })
  calendarSuggestion: string | null;

  @Column({ type: 'boolean', default: true })
  requiresApproval: boolean;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  applicationId: string | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  jobId: string | null;

  @Column({ type: 'text', nullable: true })
  applicationStatus: ApplicationStatus | null;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
