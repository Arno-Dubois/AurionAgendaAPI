import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { DateTime } from "luxon";
import type { Schedule, ScheduleService } from "../../application/ScheduleService.js";
import {
  CurrentSchema,
  errorResponses,
  NextSchema,
  RangeQuerySchema,
  ScheduleSchema,
  toEventDto,
  WeekQuerySchema,
} from "../schemas.js";

const TAGS = ["events"];

export const eventRoutes =
  (service: ScheduleService): FastifyPluginAsyncZod =>
  // eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugins are async.
  async (app) => {
    const iso = (date: DateTime) => date.setZone(service.timezone).toISO() ?? "";
    const toResponse = ({ range, events }: Schedule) => ({
      from: iso(range.from),
      to: iso(range.to),
      timezone: service.timezone,
      count: events.length,
      events: events.map(toEventDto),
    });

    app.get(
      "/events",
      {
        schema: {
          tags: TAGS,
          summary: "Events between two dates",
          description:
            "Events overlapping `[from, to)`, sorted by start. Defaults to the next 7 days " +
            "(`from=today`, `to=today+P6D`). Examples: `?from=now&to=+P7D`, " +
            "`?from=2026-11-16&to=2026-11-20`, `?from=startOfMonth&to=endOfMonth`.",
          querystring: RangeQuerySchema,
          response: { 200: ScheduleSchema, ...errorResponses },
        },
      },
      async (request) => toResponse(await service.between(request.query.from, request.query.to)),
    );

    app.get(
      "/events/today",
      {
        schema: {
          tags: TAGS,
          summary: "Today's events",
          response: { 200: ScheduleSchema, ...errorResponses },
        },
      },
      async () => toResponse(await service.today()),
    );

    app.get(
      "/events/week",
      {
        schema: {
          tags: TAGS,
          summary: "A whole week, Monday to Sunday",
          querystring: WeekQuerySchema,
          response: { 200: ScheduleSchema, ...errorResponses },
        },
      },
      async (request) => toResponse(await service.week(request.query.offset)),
    );

    app.get(
      "/events/current",
      {
        schema: {
          tags: TAGS,
          summary: "Events happening right now",
          response: { 200: CurrentSchema, ...errorResponses },
        },
      },
      async () => {
        const { at, events } = await service.current();
        return { at: iso(at), timezone: service.timezone, events: events.map(toEventDto) };
      },
    );

    app.get(
      "/events/next",
      {
        schema: {
          tags: TAGS,
          summary: "The next event to start",
          response: { 200: NextSchema, ...errorResponses },
        },
      },
      async () => {
        const { at, event } = await service.next();
        return {
          at: iso(at),
          timezone: service.timezone,
          event: event === null ? null : toEventDto(event),
        };
      },
    );
  };
