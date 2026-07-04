import type { Profile } from '../../../lib/database/entities';

/** Minimum real experience text required before we generate tailored docs. */
export function assertProfileHasExperience(
  profile: Profile | null | undefined,
): string | null {
  if (!profile) {
    return 'Save your master profile first (PUT /v1/profile) with masterResume and/or experience.';
  }

  const resume = profile.masterResume?.trim() ?? '';
  const summary = profile.summary?.trim() ?? '';
  const experience = profile.experience ?? [];
  const hasExperienceRows = experience.some(
    (row) =>
      Boolean(row.company?.trim() || row.title?.trim()) ||
      (row.bullets?.length ?? 0) > 0,
  );

  if (!resume && !summary && !hasExperienceRows) {
    return 'Your profile has no experience yet. Add masterResume and/or experience so documents can be tailored to you.';
  }

  return null;
}

/** Canonical block every document agent must treat as the only source of truth. */
export function buildExperienceSourceBlock(profile: Profile): string {
  const experienceJson = JSON.stringify(profile.experience ?? [], null, 2);

  return `CANDIDATE IDENTITY (use exactly; do not invent):
- Full name: ${profile.fullName ?? 'not provided'}
- Headline: ${profile.headline ?? 'not provided'}
- Phone: ${profile.phone?.trim() || 'not provided'}
- LinkedIn: ${profile.linkedinUrl?.trim() || 'not provided'}
- Skills on file: ${(profile.skills ?? []).join(', ') || 'none listed'}

MASTER RESUME (source of truth — only use facts present here):
${profile.masterResume?.trim() || '(empty)'}

STRUCTURED EXPERIENCE (source of truth):
${experienceJson}

SUMMARY:
${profile.summary?.trim() || '(empty)'}

HARD RULES:
1. Use ONLY employers, titles, dates, skills, and achievements that appear above.
2. You may reorder, shorten, or rephrase for the target role — never add new jobs, degrees, or metrics.
3. If the job asks for something not in the profile, omit it or note it as a gap — do not invent it.
4. Prefer the candidate's strongest relevant bullets for this role.`;
}
