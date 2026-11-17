import { DateTime } from "luxon";
import type { CourseEvent } from "../../src/domain/CourseEvent.js";
import type { DateRange } from "../../src/domain/DateRange.js";
import { AurionEventMapper } from "../../src/infrastructure/aurion/AurionEventMapper.js";
import { PartialResponse } from "../../src/infrastructure/aurion/PartialResponse.js";
import type { Clock } from "../../src/ports/Clock.js";
import type { ScheduleProvider } from "../../src/ports/ScheduleProvider.js";
import { fixture } from "./fixtures.js";

/** The 292 anonymised events of the recorded school year (2026-09-07 → 2027-05-03). */
export function yearEvents(): CourseEvent[] {
  const json = PartialResponse.parse(fixture("planning-year.xml"), "test").update("form:j_idt118");
  return new AurionEventMapper("Europe/Paris")
    .parseScheduleUpdate(json ?? "")
    .sort((a, b) => a.start.toMillis() - b.start.toMillis());
}

/** Provider over a fixed list of events, recording every call. */
export class InMemoryScheduleProvider implements ScheduleProvider {
  readonly calls: DateRange[] = [];
  /** When set, the next call fails with this error instead. */
  failNextWith: Error | undefined;

  constructor(readonly events: CourseEvent[] = yearEvents()) {}

  getEvents(range: DateRange): Promise<CourseEvent[]> {
    this.calls.push(range);
    const failure = this.failNextWith;
    this.failNextWith = undefined;
    if (failure !== undefined) return Promise.reject(failure);
    return Promise.resolve(this.events.filter((event) => range.overlaps(event)));
  }
}

/** A clock stuck at `iso` (Europe/Paris unless the string has an offset). */
export function fixedClock(iso: string): Clock & { set(iso: string): void } {
  let now = parse(iso);
  return {
    now: () => now,
    set: (next) => {
      now = parse(next);
    },
  };
}

function parse(iso: string): DateTime<true> {
  const date = DateTime.fromISO(iso, { zone: "Europe/Paris" });
  if (!date.isValid) throw new Error(`Bad test date ${iso}`);
  return date;
}
