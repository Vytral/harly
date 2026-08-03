export function nextOtpAttempt(attempts: number, maxAttempts: number): number | null {
  return attempts >= maxAttempts ? null : attempts + 1;
}
