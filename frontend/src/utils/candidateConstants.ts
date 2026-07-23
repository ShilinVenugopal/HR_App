export const CANDIDATE_STATUSES = [
  'APPLIED',
  'SCREENING',
  'INTERVIEW_SCHEDULED',
  'INTERVIEW_COMPLETED',
  'SELECTED',
  'REJECTED',
  'OFFER_RELEASED',
  'JOINED',
  'CANCELLED',
] as const;

export const INTERVIEW_STAGES = ['NOT_STARTED', 'SCHEDULED', 'COMPLETED', 'PASSED', 'FAILED', 'ON_HOLD'] as const;

export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];
export type InterviewStage = (typeof INTERVIEW_STAGES)[number];
