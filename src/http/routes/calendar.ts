import type { FastifyReply, FastifyRequest, HookHandlerDoneFunction } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { ScheduleService } from "../../application/ScheduleService.js";
import type { CalendarExporter } from "../../ports/CalendarExporter.js";
import { secretMatcher } from "../auth.js";
import { NotFoundError } from "../problem.js";
import { ProblemSchema } from "../schemas.js";

export interface CalendarFeedOptions {
  /** Secret part of the feed URL. */
  token: string;
  /** Name shown by calendar apps. */
  name: string;
  exporter: CalendarExporter;
}

const weeks = (fallback: number, description: string) =>
  z.coerce.number().int().min(0).max(52).default(fallback).describe(description);

export const CalendarQuerySchema = z.object({
  pastWeeks: weeks(2, "Whole weeks before the current one to include."),
  futureWeeks: weeks(8, "Whole weeks after the current one to include."),
});

/**
 * `GET /cal/<token>.ics`: the timetable as an iCalendar feed to subscribe to.
 *
 * Calendar apps can only be given a URL, so the token travels in the path rather than in
 * an `Authorization` header. It is compared in constant time, and a wrong token answers 404
 * before any validation or Aurion call.
 */
export const calendarRoutes =
  (service: ScheduleService, options: CalendarFeedOptions): FastifyPluginAsyncZod =>
  // eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugins are async.
  async (app) => {
    const matches = secretMatcher(options.token);
    const checkToken = (
      request: FastifyRequest,
      _reply: FastifyReply,
      done: HookHandlerDoneFunction,
    ): void => {
      const { token } = request.params as { token?: string };
      done(
        token !== undefined && matches(token) ? undefined : new NotFoundError("Unknown calendar."),
      );
    };

    app.get(
      "/cal/:token.ics",
      {
        // Before validation, so a wrong token never learns anything from a 400.
        onRequest: checkToken,
        schema: {
          tags: ["calendar"],
          summary: "iCalendar feed to subscribe to",
          description:
            "Subscribe to this URL from Google Calendar (Other calendars → From URL), Apple " +
            "Calendar or Outlook. `token` is the server's `CALENDAR_TOKEN`. The feed covers " +
            "whole weeks around the current one; events keep their Aurion id as `UID`, so " +
            "refreshes update them in place. When Aurion is unreachable the feed answers 503 " +
            "and apps keep the last copy instead of emptying the calendar.",
          security: [],
          params: z.object({ token: z.string().max(256).describe("The CALENDAR_TOKEN.") }),
          querystring: CalendarQuerySchema,
          response: {
            200: {
              description: "iCalendar (RFC 5545) document.",
              content: { "text/calendar": { schema: z.string() } },
            },
            400: ProblemSchema,
            404: ProblemSchema,
            502: ProblemSchema,
            503: ProblemSchema,
          },
        },
      },
      async (request, reply) => {
        const { pastWeeks, futureWeeks } = request.query;
        const { events } = await service.weeks(-pastWeeks, futureWeeks);
        const body = options.exporter.export({
          name: options.name,
          timezone: service.timezone,
          generatedAt: service.now(),
          events,
        });
        return reply
          .type(options.exporter.contentType)
          .header("Content-Disposition", 'inline; filename="timetable.ics"')
          .header("Cache-Control", "no-store")
          .send(body);
      },
    );
  };
