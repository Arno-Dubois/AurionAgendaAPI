import type { DateTime } from "luxon";
import type { CourseEvent } from "../domain/CourseEvent.js";

/** Everything a calendar file needs besides the events themselves. */
export interface CalendarDocument {
  /** Shown by calendar apps as the subscription's name. */
  name: string;
  /** Zone the timetable belongs to, as a hint for apps that display it. */
  timezone: string;
  /** When the document was generated. */
  generatedAt: DateTime;
  events: readonly CourseEvent[];
}

/** Turns events into a calendar file format (iCalendar today, maybe others later). */
export interface CalendarExporter {
  /** Value for the Content-Type header, e.g. `text/calendar; charset=utf-8`. */
  readonly contentType: string;
  export(calendar: CalendarDocument): string;
}
