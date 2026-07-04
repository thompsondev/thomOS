export type BoardKind =
  | 'greenhouse'
  | 'lever'
  | 'ashby'
  | 'workable'
  | 'linkedin'
  | 'indeed'
  | 'generic';

const AUTOMATABLE_BOARDS: BoardKind[] = [
  'greenhouse',
  'lever',
  'ashby',
  'workable',
  'generic',
];

export function detectBoard(url: string, source?: string | null): BoardKind {
  const u = (url || '').toLowerCase();
  const s = (source || '').toLowerCase();

  if (
    s === 'linkedin' ||
    u.includes('linkedin.com/jobs') ||
    u.includes('linkedin.com/job') ||
    u.includes('linkedin.com/apply')
  ) {
    return 'linkedin';
  }
  if (
    s === 'indeed' ||
    u.includes('indeed.com') ||
    u.includes('apply.indeed.com')
  ) {
    return 'indeed';
  }
  if (
    s === 'greenhouse' ||
    u.includes('greenhouse.io') ||
    u.includes('boards.greenhouse')
  ) {
    return 'greenhouse';
  }
  if (s === 'lever' || u.includes('lever.co') || u.includes('jobs.lever')) {
    return 'lever';
  }
  if (s === 'ashby' || u.includes('ashbyhq.com') || u.includes('jobs.ashby')) {
    return 'ashby';
  }
  if (
    s === 'workable' ||
    u.includes('workable.com') ||
    u.includes('apply.workable')
  ) {
    return 'workable';
  }
  return 'generic';
}

export function isAutomatableBoard(board: BoardKind): boolean {
  return AUTOMATABLE_BOARDS.includes(board);
}

export function unsupportedBoardMessage(board: BoardKind): string | null {
  switch (board) {
    case 'linkedin':
      return 'LinkedIn Easy Apply is not automated (ToS / anti-bot). Use Email CV or apply on the company Greenhouse/Lever/Ashby page instead.';
    case 'indeed':
      return 'Indeed apply is not automated (ToS / anti-bot). Use Email CV or apply on the company career page (Greenhouse, Lever, Ashby) instead.';
    default:
      return null;
  }
}

/** Common label/name patterns → profile field keys */
export const PROFILE_FIELD_PATTERNS: Array<{
  key:
    | 'firstName'
    | 'lastName'
    | 'fullName'
    | 'email'
    | 'phone'
    | 'linkedin'
    | 'location';
  patterns: RegExp[];
}> = [
  {
    key: 'firstName',
    patterns: [/first\s*name/i, /^fname$/i, /given\s*name/i],
  },
  {
    key: 'lastName',
    patterns: [/last\s*name/i, /^lname$/i, /surname/i, /family\s*name/i],
  },
  {
    key: 'fullName',
    patterns: [/^name$/i, /full\s*name/i, /your\s*name/i, /applicant\s*name/i],
  },
  {
    key: 'email',
    patterns: [/e-?mail/i],
  },
  {
    key: 'phone',
    patterns: [/phone/i, /mobile/i, /tel/i],
  },
  {
    key: 'linkedin',
    patterns: [/linkedin/i],
  },
  {
    key: 'location',
    patterns: [/location/i, /city/i, /address/i, /where\s*are\s*you/i],
  },
];
