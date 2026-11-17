import { z } from "zod";
import type { CourseEvent } from "../domain/CourseEvent.js";

const nullableText = (description: string) => z.string().nullable().describe(description);

export const EventSchema = z
  .object({
    id: z.string().describe("Stable Aurion identifier, usable as an iCal UID."),
    start: z.string().describe("ISO 8601 date-time with offset."),
    end: z.string().describe("ISO 8601 date-time with offset."),
    title: z.string().describe("Subject, or the first description line when there is none."),
    subject: nullableText("Course or module name."),
    description: nullableText("Free text from the school; may span several lines."),
    room: nullableText("Raw Aurion room code."),
    kind: nullableText('Aurion session kind: "COURS_TD", "TP", "EXAM_SURV"…'),
    teacher: nullableText("The teacher shown in the Aurion calendar."),
    isExam: z.boolean(),
  })
  .describe("One slot in the timetable.");

export type EventDto = z.output<typeof EventSchema>;

export const toEventDto = (event: CourseEvent): EventDto => event.toJSON();

export const ScheduleSchema = z.object({
  from: z.string().describe("Start of the range (inclusive)."),
  to: z.string().describe("End of the range (exclusive)."),
  timezone: z.string(),
  count: z.number().int(),
  events: z.array(EventSchema),
});

export const CurrentSchema = z.object({
  at: z.string(),
  timezone: z.string(),
  events: z.array(EventSchema).describe("Events in progress; usually zero or one."),
});

export const NextSchema = z.object({
  at: z.string(),
  timezone: z.string(),
  event: EventSchema.nullable().describe("Null when nothing is planned within the range limit."),
});

/** RFC 9457 problem details, with a machine-readable `code`. */
export const ProblemSchema = z
  .object({
    type: z.string(),
    title: z.string(),
    status: z.number().int(),
    detail: z.string(),
    code: z.string(),
  })
  .describe("Error (application/problem+json).");

export type Problem = z.output<typeof ProblemSchema>;

const expression = (fallback: string, role: string) =>
  z
    .string()
    .max(64)
    .default(fallback)
    .describe(
      `${role}. ISO date (2026-11-16) or date-time (2026-11-16T08:00), keyword (now, today, ` +
        "tomorrow, yesterday, startOfWeek, endOfWeek, startOfMonth, endOfMonth), duration " +
        "from now (+P7D, -PT2H) or keyword plus duration (today+P1D). A bare date or day " +
        "keyword used as `to` includes that whole day.",
    );

export const RangeQuerySchema = z.object({
  from: expression("today", "Start of the range"),
  to: expression("today+P6D", "End of the range"),
});

export const WeekQuerySchema = z.object({
  offset: z.coerce
    .number()
    .int()
    .min(-52)
    .max(52)
    .default(0)
    .describe("0 for this week (Monday to Sunday), 1 for next week, -1 for last week."),
});

export const errorResponses = {
  400: ProblemSchema,
  401: ProblemSchema,
  502: ProblemSchema,
  503: ProblemSchema,
};
