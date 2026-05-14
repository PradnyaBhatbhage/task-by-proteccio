/**
 * Mask sensitive values for API responses and logs.
 */

export function maskMiddle(input: string, keepStart = 2, keepEnd = 2): string {
  const s = String(input);
  if (s.length <= keepStart + keepEnd) return "*".repeat(Math.min(8, s.length));
  return `${s.slice(0, keepStart)}…${s.slice(-keepEnd)}`;
}

export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return maskMiddle(email, 1, 0);
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return `${maskMiddle(local, 1, 1)}@${domain.length > 3 ? maskMiddle(domain, 1, 2) : "***"}`;
}
