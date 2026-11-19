import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ScheduleService } from "../../../src/application/ScheduleService.js";
import { AurionUnavailableError } from "../../../src/domain/errors.js";
import { type AppOptions, buildApp } from "../../../src/http/app.js";
import { redactUrl } from "../../../src/http/logging.js";
import { ICalExporter } from "../../../src/infrastructure/ical/ICalExporter.js";
import { fixedClock, InMemoryScheduleProvider } from "../../support/InMemoryScheduleProvider.js";

const CALENDAR_TOKEN = "calendar-token-0123456789";
const API_TOKEN = "api-token-0123456789abcdef";
const FEED = `/cal/${CALENDAR_TOKEN}.ics`;

const countEvents = (ics: string) => ics.split("BEGIN:VEVENT").length - 1;

describe("iCal feed (recorded school year, Thursday 19 Nov 2026 10:00)", () => {
  let provider: InMemoryScheduleProvider;
  let app: FastifyInstance;

  async function start(options: Partial<AppOptions> = {}) {
    const service = new ScheduleService(provider, fixedClock("2026-11-19T10:00"), {
      timezone: "Europe/Paris",
      maxRangeDays: 366,
    });
    app = await buildApp({
      service,
      calendar: { token: CALENDAR_TOKEN, name: "My timetable", exporter: new ICalExporter() },
      ...options,
    });
  }

  beforeEach(async () => {
    provider = new InMemoryScheduleProvider();
    await start();
  });

  afterEach(async () => {
    await app.close();
  });

  it("serves an iCalendar document", async () => {
    const response = await app.inject(FEED);

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("text/calendar; charset=utf-8");
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["content-disposition"]).toBe('inline; filename="timetable.ics"');
    expect(response.body).toMatch(/^BEGIN:VCALENDAR\r\n/);
    expect(response.body).toContain("X-WR-CALNAME:My timetable\r\n");
    expect(response.body).toContain("DTSTAMP:20261119T090000Z\r\n");
    expect(response.body).toContain("UID:49806bcb-6475-405f-bfcd-6da5d41a3784\r\n");
  });

  it("covers two weeks back to eight weeks ahead by default, in whole weeks", async () => {
    await app.inject(FEED);
    expect(provider.calls.map(String)).toEqual([
      "[2026-11-02T00:00:00.000+01:00 → 2027-01-18T00:00:00.000+01:00)",
    ]);
  });

  it("accepts pastWeeks and futureWeeks", async () => {
    const response = await app.inject(`${FEED}?pastWeeks=0&futureWeeks=0`);
    expect(provider.calls.map(String)).toEqual([
      "[2026-11-16T00:00:00.000+01:00 → 2026-11-23T00:00:00.000+01:00)",
    ]);
    expect(countEvents(response.body)).toBe(10);
  });

  it("answers HEAD requests", async () => {
    const response = await app.inject({ method: "HEAD", url: FEED });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("text/calendar; charset=utf-8");
  });

  it.each([
    ["futureWeeks=53", "INVALID_REQUEST"],
    ["pastWeeks=-1", "INVALID_REQUEST"],
    ["pastWeeks=52&futureWeeks=52", "RANGE_TOO_LARGE"],
  ])("rejects ?%s with a 400 problem", async (query, code) => {
    const response = await app.inject(`${FEED}?${query}`);
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ status: 400, code });
    expect(provider.calls).toHaveLength(0);
  });

  it.each([
    ["a wrong token", "/cal/calendar-token-0123456780.ics"],
    ["a shorter token", "/cal/calendar.ics"],
    ["the API token", `/cal/${API_TOKEN}.ics`],
  ])("answers 404 to %s, without contacting Aurion", async (_case, url) => {
    await app.close();
    await start({ apiToken: API_TOKEN });
    const response = await app.inject(url);

    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).toMatch(/^application\/problem\+json/);
    expect(response.json()).toMatchObject({ code: "NOT_FOUND", detail: "Unknown calendar." });
    expect(provider.calls).toHaveLength(0);
  });

  it("checks the token before the query, so a 400 never confirms a guess", async () => {
    const response = await app.inject("/cal/not-the-right-token-at-all.ics?futureWeeks=99");
    expect(response.statusCode).toBe(404);
  });

  it("does not need the API bearer token (calendar apps cannot send one)", async () => {
    await app.close();
    await start({ apiToken: API_TOKEN });
    expect((await app.inject(FEED)).statusCode).toBe(200);
    expect((await app.inject("/v1/events/today")).statusCode).toBe(401);
  });

  it("is disabled when no calendar token is configured", async () => {
    await app.close();
    await start({ calendar: null });
    const response = await app.inject(FEED);
    expect(response.statusCode).toBe(404);
    expect(provider.calls).toHaveLength(0);
  });

  it("answers 503 when Aurion is down, so apps keep their last copy", async () => {
    provider.failNextWith = new AurionUnavailableError("Aurion timed out.");
    const response = await app.inject(FEED);

    expect(response.statusCode).toBe(503);
    expect(response.headers["retry-after"]).toBe("60");
    expect(response.body).not.toContain("BEGIN:VCALENDAR");
  });

  it("never writes the token to the logs", async () => {
    await app.close();
    const lines: string[] = [];
    await start({
      logger: { level: "trace", stream: { write: (line: string) => lines.push(line) } },
    });

    await app.inject(FEED);
    await app.inject("/cal/some-wrong-guess-0000.ics?pastWeeks=1");

    const logs = lines.join("");
    expect(logs).toContain('"url":"/cal/[REDACTED]"');
    expect(logs).toContain('"url":"/cal/[REDACTED]?pastWeeks=1"');
    expect(logs).not.toContain(CALENDAR_TOKEN);
    expect(logs).not.toContain("some-wrong-guess");
  });

  it("is documented in the OpenAPI description, outside the bearer auth", async () => {
    await app.close();
    await start({ apiToken: API_TOKEN });
    const spec = (await app.inject("/docs/json")).json<{
      paths: Record<string, { get: { security: unknown[]; responses: Record<string, unknown> } }>;
    }>();
    const feed = spec.paths["/cal/{token}.ics"]?.get;

    expect(feed?.security).toEqual([]);
    expect(feed?.responses["200"]).toMatchObject({ content: { "text/calendar": {} } });
  });
});

describe("redactUrl", () => {
  it.each([
    ["/cal/secret.ics", "/cal/[REDACTED]"],
    ["/cal/secret.ics?pastWeeks=1", "/cal/[REDACTED]?pastWeeks=1"],
    ["/cal/secret", "/cal/[REDACTED]"],
    ["/v1/events?from=today", "/v1/events?from=today"],
    ["/docs/cal/x", "/docs/cal/x"],
  ])("%s → %s", (url, expected) => {
    expect(redactUrl(url)).toBe(expected);
  });
});
