export enum ApplicationStatus {
  FOUND = 'found',
  APPLIED = 'applied',
  WAITING = 'waiting',
  INTERVIEW = 'interview',
  REJECTED = 'rejected',
  OFFER = 'offer',
}

export enum DocumentType {
  RESUME = 'resume',
  COVER_LETTER = 'cover_letter',
}

export enum AgentId {
  DISCOVERY = 'discovery',
  MATCHING = 'matching',
  RESUME = 'resume',
  COVER_LETTER = 'cover_letter',
  APPLICATION = 'application',
  BROWSER = 'browser',
  EMAIL = 'email',
  ANALYTICS = 'analytics',
  COACH = 'coach',
  INTERVIEW_PREP = 'interview_prep',
}

export enum AgentRunStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
}
