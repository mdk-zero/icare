/**
 * A small time-limited cache for one server instance, for lookups that many
 * requests repeat within seconds of each other (the signed-in user's row, a
 * warehouse summary). Each instance keeps its own, so a change written through
 * one reaches the others within the TTL; callers pick a TTL they can live with
 * and drop the entry themselves after a write they make.
 *
 * Requests for a key that is already loading share that one load rather than
 * each going to the database. A load that throws caches nothing.
 */
export class TtlCache<V> {
  private readonly entries = new Map<string, { value: V; expires: number }>();
  private readonly loading = new Map<string, Promise<V>>();
  /** Bumped by delete() and clear(), so a load that began before either doesn't store what it read. */
  private generation = 0;

  constructor(
    private readonly ttlMs: number,
    /** Oldest entries go first past this, so a long-lived instance can't grow without bound. */
    private readonly maxEntries = 500,
  ) {}

  get(key: string): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expires <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: V): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expires: Date.now() + this.ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  delete(key: string): void {
    this.generation += 1;
    this.entries.delete(key);
    this.loading.delete(key);
  }

  clear(): void {
    this.generation += 1;
    this.entries.clear();
    this.loading.clear();
  }

  /**
   * The cached value, or `load()`'s, stored when `keep` says so (by default
   * always). A load already under way for the key is shared.
   */
  async fetch(key: string, load: () => Promise<V>, keep: (value: V) => boolean = () => true): Promise<V> {
    const hit = this.get(key);
    if (hit !== undefined) return hit;
    const pending = this.loading.get(key);
    if (pending) return pending;
    const generation = this.generation;
    const started = load()
      .then((value) => {
        if (keep(value) && generation === this.generation) this.set(key, value);
        return value;
      })
      .finally(() => {
        if (this.loading.get(key) === started) this.loading.delete(key);
      });
    this.loading.set(key, started);
    return started;
  }
}
