import { DateTime } from "luxon";
import { InvalidRangeError } from "./errors.js";

/**
 * Immutable half-open time interval `[from, to)`.
 *
 * Wraps Luxon so the rest of the code never deals with raw `Date` objects
 * or with local-timezone surprises.
 */
export class DateRange {
  private constructor(
    readonly from: DateTime<true>,
    readonly to: DateTime<true>,
  ) {}

  static of(from: DateTime, to: DateTime): DateRange {
    const start = assertValid(from, "start");
    const end = assertValid(to, "end");
    if (end <= start) {
      throw new InvalidRangeError(`End (${end.toISO()}) must be after start (${start.toISO()}).`);
    }
    return new DateRange(start, end);
  }

  static fromISO(from: string, to: string, zone: string): DateRange {
    return DateRange.of(DateTime.fromISO(from, { zone }), DateTime.fromISO(to, { zone }));
  }

  /** Whole calendar days in `zone`, from the start of `firstDay` to the end of `lastDay`. */
  static days(firstDay: DateTime, lastDay: DateTime): DateRange {
    return DateRange.of(firstDay.startOf("day"), lastDay.plus({ days: 1 }).startOf("day"));
  }

  get durationInDays(): number {
    return this.to.diff(this.from, "days").days;
  }

  overlaps(other: { start: DateTime; end: DateTime }): boolean {
    return other.start < this.to && other.end > this.from;
  }

  /** Returns a range widened by `days` on both sides. */
  pad(days: number): DateRange {
    return DateRange.of(this.from.minus({ days }), this.to.plus({ days }));
  }

  /** Expands the range to whole UTC days, which is what the Aurion calendar widget requests. */
  toWholeUtcDays(): DateRange {
    return DateRange.of(
      this.from.toUTC().startOf("day"),
      this.to.toUTC().minus({ milliseconds: 1 }).plus({ days: 1 }).startOf("day"),
    );
  }

  toString(): string {
    return `[${this.from.toISO()} → ${this.to.toISO()})`;
  }
}

function assertValid(date: DateTime, label: string): DateTime<true> {
  if (!date.isValid) {
    throw new InvalidRangeError(`Invalid ${label} date: ${date.invalidExplanation ?? "unknown"}`);
  }
  return date as DateTime<true>;
}
