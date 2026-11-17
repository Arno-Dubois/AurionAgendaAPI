import type { CourseEvent } from "../../domain/CourseEvent.js";
import type { DateRange } from "../../domain/DateRange.js";
import type { ScheduleProvider } from "../../ports/ScheduleProvider.js";

export interface CacheOptions {
  /** How long fetched events are reused. 0 disables the cache. */
  ttlMs: number;
  /** Zone used to widen requests to whole days, so "now"-based ranges share entries. */
  timezone: string;
  /** Requests are only widened when the result stays within this limit. */
  maxRangeDays: number;
  /** Oldest entries are dropped beyond this count. */
  maxEntries?: number;
  /** Milliseconds clock, for tests. */
  now?: () => number;
}

interface Entry {
  range: DateRange;
  expiresAt: number;
  events: Promise<CourseEvent[]>;
}

/**
 * Decorator that remembers what another {@link ScheduleProvider} returned.
 *
 * - A request is answered from any fresh entry whose range contains it, so asking for
 *   "today" after "this week" costs nothing.
 * - Misses are widened to whole days before being fetched: `?from=now` changes every
 *   millisecond, the day it falls in does not.
 * - Entries hold the pending promise, so concurrent identical requests share one fetch
 *   (single-flight) instead of queueing several Aurion round-trips.
 * - Failures are never cached.
 */
export class CachedScheduleProvider implements ScheduleProvider {
  readonly #inner: ScheduleProvider;
  readonly #options: Required<CacheOptions>;
  #entries: Entry[] = [];

  constructor(inner: ScheduleProvider, options: CacheOptions) {
    this.#inner = inner;
    this.#options = { maxEntries: 32, now: Date.now, ...options };
  }

  async getEvents(range: DateRange): Promise<CourseEvent[]> {
    if (this.#options.ttlMs <= 0) return this.#inner.getEvents(range);

    const now = this.#options.now();
    this.#entries = this.#entries.filter((entry) => entry.expiresAt > now);
    const entry =
      this.#entries.findLast((candidate) => candidate.range.contains(range)) ??
      this.#fetch(range, now);
    const events = await entry.events;
    return events.filter((event) => range.overlaps(event));
  }

  /** Drops every entry; the next request goes to the inner provider. */
  clear(): void {
    this.#entries = [];
  }

  get size(): number {
    return this.#entries.length;
  }

  #fetch(range: DateRange, now: number): Entry {
    const { timezone, maxRangeDays, maxEntries, ttlMs } = this.#options;
    const wholeDays = range.toWholeDays(timezone);
    const target = Math.ceil(wholeDays.durationInDays) <= maxRangeDays ? wholeDays : range;

    const entry: Entry = {
      range: target,
      expiresAt: now + ttlMs,
      events: this.#inner.getEvents(target),
    };
    this.#entries.push(entry);
    if (this.#entries.length > maxEntries) this.#entries.shift();
    entry.events.catch(() => {
      this.#entries = this.#entries.filter((other) => other !== entry);
    });
    return entry;
  }
}
