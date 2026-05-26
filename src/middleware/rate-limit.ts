import rateLimit from "express-rate-limit";

/** Global API rate limit (per IP). */
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests", message: "Rate limit exceeded. Try again later." }
});

/** Stricter limit for credential-based login attempts. */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests", message: "Login rate limit exceeded. Try again later." }
});

/** Limit report generation bursts. */
export const reportRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests", message: "Report generation rate limit exceeded." }
});
