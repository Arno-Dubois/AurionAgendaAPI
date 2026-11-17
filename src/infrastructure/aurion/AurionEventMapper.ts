import { DateTime } from "luxon";
import { z } from "zod";
import { CourseEvent } from "../../domain/CourseEvent.js";
import { AurionLayoutChangedError } from "../../domain/errors.js";

/** One event as found in the PrimeFaces schedule JSON. Unknown keys are ignored. */
export const RawAurionEventSchema = z.object({
  id: z.coerce.string(),
  title: z.string().default(""),
  start: z.string(),
  end: z.string().nullish(),
  allDay: z.boolean().default(false),
  className: z.string().nullish(),
});
export type RawAurionEvent = z.infer<typeof RawAurionEventSchema>;

const ScheduleUpdateSchema = z.object({ events: z.array(z.unknown()) });

const STEP = "reading planning events";

/** CSS class Aurion puts on exams instead of the kind (whose label is then e.g. "EXAM_SURV"). */
export const EXAM_CLASS = "est-epreuve";

/**
 * Turns Aurion's schedule JSON into {@link CourseEvent}s.
 *
 * The interesting data is packed in `title`. The first line is the room and the last three
 * are the subject, the kind and the teacher; everything in between is a free-text
 * description that can span several lines (Teams links, addresses, programmes…):
 *
 * ```text
 * BORDEAUX_032_SALLE_CODESIGN   ← room
 * annulé sera décalé            ← description (often empty, may be several lines)
 * Human Aspects of Management   ← subject (empty for meetings, talks…)
 * COURS_TD                      ← kind
 * Mr DUPONT                     ← teacher (Aurion shows only one)
 * ```
 */
export class AurionEventMapper {
  constructor(private readonly timezone: string) {}

  /** Parses the content of the schedule `<update>` (`{"events" : [...]}`). */
  parseScheduleUpdate(json: string): CourseEvent[] {
    let data: unknown;
    try {
      data = JSON.parse(json);
    } catch (error) {
      throw new AurionLayoutChangedError(STEP, "schedule payload is not valid JSON", {
        cause: error,
      });
    }
    const parsed = ScheduleUpdateSchema.safeParse(data);
    if (!parsed.success) {
      throw new AurionLayoutChangedError(STEP, 'schedule payload has no "events" array');
    }
    return parsed.data.events.map((raw) => this.toDomain(raw));
  }

  toDomain(input: unknown): CourseEvent {
    const parsed = RawAurionEventSchema.safeParse(input);
    if (!parsed.success) {
      throw new AurionLayoutChangedError(STEP, `malformed event: ${parsed.error.message}`);
    }
    const raw = parsed.data;
    const start = this.#parseDate(raw.start, raw.id);
    const end =
      raw.end == null
        ? start.plus(raw.allDay ? { days: 1 } : {})
        : this.#parseDate(raw.end, raw.id);

    return new CourseEvent({ id: raw.id, start, end, ...parseTitle(raw.title, raw.className) });
  }

  #parseDate(value: string, eventId: string): DateTime<true> {
    // Aurion sends "2026-11-16T09:00:00+0100"; Luxon accepts the basic offset form.
    const date = DateTime.fromISO(value, { setZone: true, zone: this.timezone }).setZone(
      this.timezone,
    );
    if (!date.isValid) {
      throw new AurionLayoutChangedError(STEP, `event ${eventId} has an invalid date "${value}"`);
    }
    return date;
  }
}

type TitleFields = Pick<
  CourseEvent,
  "room" | "description" | "subject" | "kind" | "teacher" | "isExam"
>;

const MIN_LINES = 5;

export function parseTitle(title: string, className?: string | null): TitleFields {
  const lines = title.split(/\r?\n/);
  const orNull = (value: string | undefined) => {
    const trimmed = value?.trim();
    return trimmed === undefined || trimmed === "" ? null : trimmed;
  };
  const isExam = className === EXAM_CLASS;
  const kindFromClass = isExam ? null : orNull(className ?? undefined);

  if (lines.length < MIN_LINES) {
    // Not the usual layout: keep the whole text so nothing is lost.
    return {
      room: null,
      description: orNull(lines.map((line) => line.trim()).join("\n")),
      subject: null,
      kind: kindFromClass,
      teacher: null,
      isExam,
    };
  }

  const [room] = lines;
  const [subject, kind, teacher] = lines.slice(-3);
  const description = lines
    .slice(1, -3)
    .map((line) => line.trimEnd())
    .join("\n");
  return {
    room: orNull(room),
    description: orNull(description),
    subject: orNull(subject),
    kind: orNull(kind) ?? kindFromClass,
    teacher: orNull(teacher),
    isExam,
  };
}
