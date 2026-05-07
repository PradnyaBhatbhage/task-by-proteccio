export async function withRetry<T>(
  task: () => Promise<T>,
  retries = 2,
  baseDelayMs = 500
): Promise<T> {
  let error: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await task();
    } catch (err) {
      error = err;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, baseDelayMs * (attempt + 1)));
      }
    }
  }
  throw error;
}
