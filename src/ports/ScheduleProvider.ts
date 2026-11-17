import type { CourseEvent } from "../domain/CourseEvent.js";
import type { DateRange } from "../domain/DateRange.js";

/**
 * Anything that can produce timetable events for a time range.
 *
 * The application layer depends only on this interface, so the Aurion scraper can be
 * wrapped (caching, logging) or replaced (another school system, a fake in tests).
 */
export interface ScheduleProvider {
  /** Events overlapping `range`, sorted by start time, without duplicates. */
  getEvents(range: DateRange): Promise<CourseEvent[]>;
}
