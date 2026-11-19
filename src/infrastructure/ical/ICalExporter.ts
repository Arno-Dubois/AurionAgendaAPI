import { Duration, type DateTime } from "luxon";
import type { CourseEvent } from "../../domain/CourseEvent.js";
import type { CalendarDocument, CalendarExporter } from "../../ports/CalendarExporter.js";

export interface ICalExporterOptions {
  /** How often subscribers should fetch the feed again. Default: one hour. */
  refreshInterval?: Duration;
  /** Prefix added to the title of exams, which most apps do not otherwise distinguish. */
  examPrefix?: string;
}

const CRLF = "\r\n";
/** RFC 5545 §3.1: lines longer than 75 octets must be folded. */
const MAX_LINE_OCTETS = 75;
const PRODID = "-//Arno Dubois//AurionAgendaAPI//EN";

/**
 * Writes events as an iCalendar (RFC 5545) feed that Google Calendar, Apple Calendar and
 * Outlook can subscribe to.
 *
 * - Every event keeps the Aurion identifier as its `UID`, so a refreshed feed updates the
 *   events already in the calendar instead of duplicating them.
 * - Times are written in UTC (`DTSTART:20261116T080000Z`): it is unambiguous across DST
 *   changes and needs no `VTIMEZONE` block. Apps display them in the user's own zone, and
 *   `X-WR-TIMEZONE` tells them which zone the timetable belongs to.
 * - `REFRESH-INTERVAL` (RFC 7986) and its older spelling `X-PUBLISHED-TTL` ask subscribers
 *   to poll again every hour. Apple and Outlook honour it; Google polls on its own schedule.
 *
 * Hand-written rather than pulled from a library: the subset needed (one calendar, simple
 * events) is small, and owning escaping and line folding keeps the output easy to test.
 */
export class ICalExporter implements CalendarExporter {
  readonly contentType = "text/calendar; charset=utf-8";
  readonly #refreshInterval: string;
  readonly #examPrefix: string;

  constructor(options: ICalExporterOptions = {}) {
    const refresh = options.refreshInterval ?? Duration.fromObject({ hours: 1 });
    const iso = refresh.rescale().toISO();
    if (iso === null || refresh.toMillis() <= 0) {
      throw new RangeError("refreshInterval must be a positive duration.");
    }
    this.#refreshInterval = iso;
    this.#examPrefix = options.examPrefix ?? "[EXAM] ";
  }

  export(calendar: CalendarDocument): string {
    const stamp = formatUtc(calendar.generatedAt);
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      `PRODID:${PRODID}`,
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      `NAME:${escapeText(calendar.name)}`,
      `X-WR-CALNAME:${escapeText(calendar.name)}`,
      `X-WR-TIMEZONE:${escapeText(calendar.timezone)}`,
      `REFRESH-INTERVAL;VALUE=DURATION:${this.#refreshInterval}`,
      `X-PUBLISHED-TTL:${this.#refreshInterval}`,
      ...calendar.events.flatMap((event) => this.#event(event, stamp)),
      "END:VCALENDAR",
    ];
    return lines.map(fold).join(CRLF) + CRLF;
  }

  #event(event: CourseEvent, stamp: string): string[] {
    const title = event.isExam ? `${this.#examPrefix}${event.title}` : event.title;
    const categories = [event.kind, event.isExam ? "EXAM" : null].filter((c) => c !== null);
    return [
      "BEGIN:VEVENT",
      `UID:${escapeText(event.id)}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${formatUtc(event.start)}`,
      `DTEND:${formatUtc(event.end)}`,
      `SUMMARY:${escapeText(title)}`,
      ...optional("LOCATION", event.room),
      ...optional("DESCRIPTION", describe(event)),
      ...(categories.length > 0 ? [`CATEGORIES:${categories.map(escapeText).join(",")}`] : []),
      "STATUS:CONFIRMED",
      "TRANSP:OPAQUE",
      "END:VEVENT",
    ];
  }
}

/** The free text from the school, then who teaches it and what kind of session it is. */
function describe(event: CourseEvent): string | null {
  const details = [
    event.teacher === null ? null : `Teacher: ${event.teacher}`,
    event.kind === null ? null : `Type: ${event.kind}`,
  ].filter((line) => line !== null);
  const parts = [event.description, details.join("\n")].filter(
    (part): part is string => part !== null && part !== "",
  );
  return parts.length > 0 ? parts.join("\n\n") : null;
}

function optional(name: string, value: string | null): string[] {
  return value === null || value === "" ? [] : [`${name}:${escapeText(value)}`];
}

/** `20261116T080000Z` (RFC 5545 §3.3.5, form #2: UTC time). */
export function formatUtc(date: DateTime): string {
  return date.toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");
}

/**
 * Escapes a TEXT value (RFC 5545 §3.3.11): backslash, semicolon, comma and newlines.
 * Other control characters are not allowed and are dropped.
 */
export function escapeText(value: string): string {
  return (
    value
      .replaceAll("\r\n", "\n")
      .replaceAll("\r", "\n")
      // eslint-disable-next-line no-control-regex -- removing control characters on purpose.
      .replaceAll(/[\x00-\x08\x0B-\x1F\x7F]/g, "")
      .replaceAll("\\", "\\\\")
      .replaceAll(";", "\\;")
      .replaceAll(",", "\\,")
      .replaceAll("\n", "\\n")
  );
}

/**
 * Folds a content line into chunks of at most 75 octets (RFC 5545 §3.1). Continuation lines
 * start with a space. Splits only between code points so multi-byte UTF-8 characters
 * ("é", emoji) stay intact.
 */
export function fold(line: string): string {
  if (Buffer.byteLength(line) <= MAX_LINE_OCTETS) return line;
  const chunks: string[] = [];
  let current = "";
  let octets = 0;
  for (const char of line) {
    const size = Buffer.byteLength(char);
    // Continuation lines lose one octet to the leading space.
    const limit = chunks.length === 0 ? MAX_LINE_OCTETS : MAX_LINE_OCTETS - 1;
    if (octets + size > limit) {
      chunks.push(current);
      current = "";
      octets = 0;
    }
    current += char;
    octets += size;
  }
  chunks.push(current);
  return chunks.join(`${CRLF} `);
}
