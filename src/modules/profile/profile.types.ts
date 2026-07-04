import type { Profile, ProfileFilters } from '../../lib/database/entities';

export type UpsertProfileDto = {
  userId: string;
  fullName?: string;
  headline?: string;
  summary?: string;
  phone?: string | null;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  masterResume?: string;
  skills?: string[];
  filters?: ProfileFilters;
  experience?: Profile['experience'];
};
