import { AgentId } from '../../lib/database/entities';
import type { Application } from '../../lib/database/entities';
import type { Job } from '../../lib/database/entities';
import type { Profile } from '../../lib/database/entities';

export interface AgentContext {
  userId: string;
  profile?: Profile | null;
  job?: Job | null;
  application?: Application | null;
  input?: Record<string, unknown>;
}

export interface AgentResult<T = unknown> {
  agentId: AgentId;
  success: boolean;
  data?: T;
  error?: string;
  summary: string;
}

export interface AgentDescriptor {
  id: AgentId;
  name: string;
  responsibilities: string[];
}

export interface PipelineResult {
  pipeline: string;
  steps: AgentResult[];
  applicationId?: string;
  jobIds?: string[];
}
