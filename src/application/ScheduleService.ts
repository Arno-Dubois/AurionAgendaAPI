import type { DateTime } from "luxon";
import type { CourseEvent } from "../domain/CourseEvent.js";
import { DateExpression } from "../domain/DateExpression.js";
import { DateRange } from "../domain/DateRange.js";
import type { Clock } from "../ports/Clock.js";
import type { ScheduleProvider } from "../ports/ScheduleProvider.js";

export interface ScheduleServiceOptions {
  /** Zone for dates without an offset, "today", week boundaries and output. */
  timezone: string;
  /** Longest range a caller may ask for. */
  maxRangeDays: number;
  /** `next()` first looks this many days ahead, then up to `maxRangeDays`. */
  nextLookaheadDays?: number;
}

export interface Schedule {
  range: DateRange;
  events: CourseEvent[];
}

/**
 * Use cases of the timetable, independent of HTTP and of Aurion.
 *
 * Every method validates its range before asking the provider, so a bad request never
 * costs a login.
 */
export class ScheduleService {
  readonly #provider: ScheduleProvider;
  readonly #clock: Clock;
  readonly #options: Required<ScheduleServiceOptions>;

  constructor(provider: ScheduleProvider, clock: Clock, options: ScheduleServiceOptions) {
    this.#provider = provider;
    this.#clock = clock;
    this.#options = { nextLookaheadDays: 14, ...options };
  }

  get timezone(): string {
    return this.#options.timezone;
  }

  /** Current time in the service's zone. */
  now(): DateTime<true> {
    return this.#clock.now().setZone(this.#options.timezone) as DateTime<true>;
  }

  /** Parses user input such as `"today"`, `"+P7D"` or `"2026-11-16"`. */
  parse(expression: string): DateExpression {
    return DateExpression.parse(expression, this.#options.timezone);
  }

  /** Resolves two expressions into a validated range, at the current time. */
  range(from: string | DateExpression, to: string | DateExpression): DateRange {
    const now = this.now();
    const toExpression = (value: string | DateExpression) =>
      typeof value === "string" ? this.parse(value) : value;
    return DateRange.of(
      toExpression(from).resolve(now, "from"),
      toExpression(to).resolve(now, "to"),
    ).assertAtMostDays(this.#options.maxRangeDays);
  }

  async between(from: string | DateExpression, to: string | DateExpression): Promise<Schedule> {
    return this.#load(this.range(from, to));
  }

  async today(): Promise<Schedule> {
    return this.between("today", "today");
  }

  /** Monday to Sunday; `offset` 1 is next week, -1 last week. */
  async week(offset = 0): Promise<Schedule> {
    return this.weeks(offset, offset);
  }

  /**
   * Whole weeks, from the Monday of week `first` to the Sunday of week `last` (offsets from
   * the current week). `weeks(-2, 8)` covers two weeks back to eight weeks ahead.
   *
   * Aligning on weeks keeps the range identical all week long, which makes repeated calls
   * (a calendar app polling a feed) hit the cache.
   */
  async weeks(first: number, last: number): Promise<Schedule> {
    if (!Number.isInteger(first) || !Number.isInteger(last) || last < first) {
      throw new RangeError("weeks(first, last) needs integers with first <= last.");
    }
    const monday = this.now().startOf("week");
    return this.#load(
      DateRange.of(monday.plus({ weeks: first }), monday.plus({ weeks: last + 1 })),
    );
  }

  /** Events happening right now (usually zero or one, but events can overlap). */
  async current(): Promise<{ at: DateTime<true>; events: CourseEvent[] }> {
    const at = this.now();
    const { events } = await this.today();
    return { at, events: events.filter((event) => event.isOngoingAt(at)) };
  }

  /** The first event that starts after now, or null if none within `maxRangeDays`. */
  async next(): Promise<{ at: DateTime<true>; event: CourseEvent | null }> {
    const at = this.now();
    const { nextLookaheadDays, maxRangeDays } = this.#options;
    const today = at.startOf("day");
    // Look at the next two weeks first (cheap, usually cached), then the rest of the year.
    const firstDays = Math.min(nextLookaheadDays, maxRangeDays);
    const windows = [DateRange.of(today, today.plus({ days: firstDays }))];
    if (maxRangeDays > firstDays) {
      windows.push(
        DateRange.of(today.plus({ days: firstDays }), today.plus({ days: maxRangeDays })),
      );
    }
    for (const window of windows) {
      const { events } = await this.#load(window);
      const event = events.find((candidate) => candidate.start > at);
      if (event !== undefined) return { at, event };
    }
    return { at, event: null };
  }

  async #load(range: DateRange): Promise<Schedule> {
    range.assertAtMostDays(this.#options.maxRangeDays);
    return { range, events: await this.#provider.getEvents(range) };
  }
}
