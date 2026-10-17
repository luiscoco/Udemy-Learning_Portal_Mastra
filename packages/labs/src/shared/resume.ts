export type ResumeErrorCode = 'UNKNOWN_RUN' | 'NOT_SUSPENDED' | 'INVALID_RESUME_DATA' | 'ALREADY_RESUMED' | 'WRONG_STEP';

/** Maps Mastra's workflow resume errors (messages verified on @mastra/core 1.78.0) to typed codes. */
export function classifyResumeError(message: string): ResumeErrorCode {
  if (/already resumed by another caller/i.test(message)) return 'ALREADY_RESUMED';
  if (/Invalid resume data/i.test(message)) return 'INVALID_RESUME_DATA';
  if (/step ".*" was not suspended/i.test(message)) return 'WRONG_STEP';
  return 'NOT_SUSPENDED';
}
