import { DateTime, Duration } from "luxon";
import { describe, expect, it } from "vitest";
import { CourseEvent, type CourseEventProps } from "../../../src/domain/CourseEvent.js";
import {
  escapeText,
  fold,
  formatUtc,
  ICalExporter,
} from "../../../src/infrastructure/ical/ICalExporter.js";
import { yearEvents } from "../../support/InMemoryScheduleProvider.js";

const ZONE = "Europe/Paris";
const GENERATED_AT = DateTime.fromISO("2026-11-19T10:00", { zone: ZONE });

const at = (iso: string) => DateTime.fromISO(iso, { zone: ZONE }) as DateTime<true>;

function event(overrides: Partial<CourseEventProps> = {}): CourseEvent {
  return new CourseEvent({
    id: "11111111-2222-3333-4444-555555555555",
    start: at("2026-11-20T08:30"),
    end: at("2026-11-20T10:30"),
    subject: null,
    description: null,
    room: null,
    kind: null,
    teacher: null,
    isExam: false,
    ...overrides,
  });
}

function exportEvents(events: CourseEvent[], exporter = new ICalExporter()): string {
  return exporter.export({
    name: "Aurion timetable",
    timezone: ZONE,
    generatedAt: GENERATED_AT,
    events,
  });
}

/** Undoes line folding (RFC 5545 §3.1) and splits the document into content lines. */
const unfold = (ics: string) => ics.replaceAll("\r\n ", "").split("\r\n").slice(0, -1);

/** The VEVENT blocks of a document, as `NAME` → value maps (parameters kept in the name). */
function vevents(ics: string): Map<string, string>[] {
  const events: Map<string, string>[] = [];
  let current: Map<string, string> | null = null;
  for (const line of unfold(ics)) {
    if (line === "BEGIN:VEVENT") current = new Map();
    else if (line === "END:VEVENT" && current !== null) {
      events.push(current);
      current = null;
    } else if (current !== null) {
      const colon = line.indexOf(":");
      current.set(line.slice(0, colon), line.slice(colon + 1));
    }
  }
  return events;
}

const week = () =>
  yearEvents().filter((e) => e.start >= at("2026-11-16") && e.start < at("2026-11-23"));

describe("ICalExporter", () => {
  it("writes a calendar that apps can subscribe to and refresh hourly", () => {
    const lines = unfold(exportEvents([]));
    expect(lines).toEqual([
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Arno Dubois//AurionAgendaAPI//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "NAME:Aurion timetable",
      "X-WR-CALNAME:Aurion timetable",
      "X-WR-TIMEZONE:Europe/Paris",
      "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
      "X-PUBLISHED-TTL:PT1H",
      "END:VCALENDAR",
    ]);
  });

  it("uses CRLF line endings, including after the last line", () => {
    const ics = exportEvents(week());
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replaceAll("\r\n", "")).not.toMatch(/[\r\n]/);
  });

  it("exports a real week, keeping the Aurion id as UID", () => {
    const events = week();
    const exported = vevents(exportEvents(events));

    expect(exported).toHaveLength(10);
    expect(exported.map((e) => e.get("UID"))).toEqual(events.map((e) => e.id));
    expect(Object.fromEntries(exported[0] ?? [])).toEqual({
      UID: "49806bcb-6475-405f-bfcd-6da5d41a3784",
      DTSTAMP: "20261119T090000Z",
      // 09:00 in Paris in November (UTC+1).
      DTSTART: "20261116T080000Z",
      DTEND: "20261116T110000Z",
      SUMMARY: "Human Aspects of Management",
      LOCATION: "BORDEAUX_032_SALLE_CODESIGN",
      DESCRIPTION: "annulé sera décalé\\n\\nTeacher: Mr TEACHER_A\\nType: COURS_TD",
      CATEGORIES: "COURS_TD",
      STATUS: "CONFIRMED",
      TRANSP: "OPAQUE",
    });
  });

  it("converts summer-time events to UTC with the right offset", () => {
    const september = yearEvents().find((e) => e.start.month === 9);
    expect(september?.start.offset).toBe(120);
    const [exported] = vevents(exportEvents(september ? [september] : []));
    expect(exported?.get("DTSTART")).toBe(formatUtc(september?.start ?? GENERATED_AT));
    expect(exported?.get("DTSTART")).toMatch(
      new RegExp(`T${String((september?.start.hour ?? 0) - 2).padStart(2, "0")}`),
    );
  });

  it("makes exams stand out in the title and the categories", () => {
    const exam = yearEvents().find((e) => e.isExam);
    expect(exam).toBeDefined();
    const [exported] = vevents(exportEvents(exam ? [exam] : []));
    expect(exported?.get("SUMMARY")).toBe(`[EXAM] ${exam?.title ?? ""}`);
    expect(exported?.get("CATEGORIES")?.split(",")).toContain("EXAM");
  });

  it("allows a custom exam prefix and refresh interval", () => {
    const exporter = new ICalExporter({
      examPrefix: "📝 ",
      refreshInterval: Duration.fromObject({ minutes: 90 }),
    });
    const ics = exportEvents([event({ subject: "Maths", isExam: true })], exporter);
    expect(ics).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT1H30M\r\n");
    expect(vevents(ics)[0]?.get("SUMMARY")).toBe("📝 Maths");
  });

  it("rejects a refresh interval that is not positive", () => {
    expect(() => new ICalExporter({ refreshInterval: Duration.fromMillis(0) })).toThrow(RangeError);
  });

  it("leaves out properties that have no value", () => {
    const [exported] = vevents(exportEvents([event({ subject: "Maths" })]));
    expect([...(exported?.keys() ?? [])]).toEqual([
      "UID",
      "DTSTAMP",
      "DTSTART",
      "DTEND",
      "SUMMARY",
      "STATUS",
      "TRANSP",
    ]);
  });

  it("escapes text so commas, semicolons and newlines survive", () => {
    const [exported] = vevents(
      exportEvents([
        event({ subject: "Talk; Q&A, part 1", description: "Line 1\nC:\\path", room: "A,B" }),
      ]),
    );
    expect(exported?.get("SUMMARY")).toBe("Talk\\; Q&A\\, part 1");
    expect(exported?.get("LOCATION")).toBe("A\\,B");
    expect(exported?.get("DESCRIPTION")).toBe("Line 1\\nC:\\\\path");
  });

  it("keeps lines within 75 octets, even with long accented descriptions", () => {
    const long = "Réunion d'information sur les échanges à l'étranger — ".repeat(10);
    const ics = exportEvents([event({ subject: "Info", description: long }), ...week()]);
    for (const line of ics.split("\r\n")) {
      expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    }
    expect(vevents(ics)[0]?.get("DESCRIPTION")).toBe(escapeText(long));
  });

  it("gives the same events the same lines on every refresh, except DTSTAMP", () => {
    const strip = (ics: string) => ics.replaceAll(/DTSTAMP:\w+/g, "");
    const exporter = new ICalExporter();
    const calendar = { name: "x", timezone: ZONE, events: week() };
    const first = exporter.export({ ...calendar, generatedAt: GENERATED_AT });
    const later = exporter.export({ ...calendar, generatedAt: GENERATED_AT.plus({ hours: 5 }) });
    expect(later).not.toBe(first);
    expect(strip(later)).toBe(strip(first));
  });

  it("serves the iCalendar media type", () => {
    expect(new ICalExporter().contentType).toBe("text/calendar; charset=utf-8");
  });
});

describe("escapeText", () => {
  it("escapes backslashes, semicolons, commas and newlines (RFC 5545 §3.3.11)", () => {
    expect(escapeText("a\\b;c,d\ne")).toBe("a\\\\b\\;c\\,d\\ne");
  });

  it("normalises CR and CRLF to newlines and drops other control characters", () => {
    expect(escapeText("a\r\nb\rc\u0007d\te")).toBe("a\\nb\\ncd\te");
  });
});

describe("fold", () => {
  it("leaves short lines alone", () => {
    expect(fold("SUMMARY:Maths")).toBe("SUMMARY:Maths");
    expect(fold("X".repeat(75))).toBe("X".repeat(75));
  });

  it("splits long lines into 75-octet chunks continued by a space", () => {
    const folded = fold("X".repeat(200));
    const lines = folded.split("\r\n");
    expect(lines.map((l) => l.length)).toEqual([75, 75, 52]);
    expect(lines.slice(1).every((l) => l.startsWith(" "))).toBe(true);
    expect(folded.replaceAll("\r\n ", "")).toBe("X".repeat(200));
  });

  it("never splits a multi-byte character", () => {
    const line = `DESCRIPTION:${"é🎓".repeat(40)}`;
    const folded = fold(line);
    for (const part of folded.split("\r\n")) {
      expect(Buffer.byteLength(part)).toBeLessThanOrEqual(75);
      expect(part).not.toContain("�");
      // A lone surrogate would mean an emoji was cut in half.
      expect(part).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
    }
    expect(folded.replaceAll("\r\n ", "")).toBe(line);
  });
});
