import type { Profile, ProfileFilters } from '../../lib/database/entities';

export type UpsertProfileDto = {
  userId: string;
  fullName?: string;
  headline?: string;
  summary?: string;
  phone?: string;
  linkedinUrl?: string;
  masterResume?: string;
  skills?: string[];
  filters?: ProfileFilters;
  experience?: Profile['experience'];
};
