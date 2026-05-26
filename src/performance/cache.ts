/**
 * Lightweight in-process TTL cache for expensive read aggregates.
 */
export class TtlCache<T> {
  private value: T | undefined;
  private expiresAt = 0;
  private catalogVersion = 0;

  constructor(
    private readonly ttlMs: number,
    private readonly getCatalogVersion: () => number
  ) {}

  get(): T | undefined {
    if (this.value === undefined) return undefined;
    if (Date.now() >= this.expiresAt) return undefined;
    if (this.getCatalogVersion() !== this.catalogVersion) return undefined;
    return this.value;
  }

  set(value: T): T {
    this.value = value;
    this.catalogVersion = this.getCatalogVersion();
    this.expiresAt = Date.now() + this.ttlMs;
    return value;
  }

  invalidate(): void {
    this.value = undefined;
    this.expiresAt = 0;
  }
}
