import { DateTime } from "luxon";
import { afterEach, describe, expect, it } from "vitest";
import { ScheduleService } from "../../src/application/ScheduleService.js";
import { DEFAULTS } from "../../src/config/AurionConfig.js";
import { Credentials } from "../../src/domain/Credentials.js";
import { buildApp } from "../../src/http/app.js";
import { AurionScheduleProvider } from "../../src/infrastructure/aurion/AurionScheduleProvider.js";
import { CachedScheduleProvider } from "../../src/infrastructure/cache/CachedScheduleProvider.js";
import { BASE_URL, FakeAurion, VALID_PASSWORD, VALID_USERNAME } from "../support/FakeAurion.js";
import { fixedClock } from "../support/InMemoryScheduleProvider.js";

/** Wires the real objects as main.ts does, with a fake Aurion behind them. */
async function createStack(clock = fixedClock("2026-11-18T10:00")) {
  const aurion = new FakeAurion();
  const scraper = new AurionScheduleProvider(
    {
      ...DEFAULTS,
      baseUrl: BASE_URL,
      credentials: new Credentials(VALID_USERNAME, VALID_PASSWORD),
    },
    { fetch: aurion.fetch },
  );
  const cache = new CachedScheduleProvider(scraper, {
    ttlMs: 60_000,
    timezone: DEFAULTS.timezone,
    maxRangeDays: DEFAULTS.maxRangeDays,
  });
  const service = new ScheduleService(cache, clock, {
    timezone: DEFAULTS.timezone,
    maxRangeDays: DEFAULTS.maxRangeDays,
  });
  return { aurion, app: await buildApp({ service }) };
}

describe("HTTP API → cache → scraper → fake Aurion", () => {
  let stack: Awaited<ReturnType<typeof createStack>>;

  afterEach(async () => {
    await stack.app.close();
  });

  it("serves several endpoints with one login, reusing cached ranges", async () => {
    stack = await createStack();
    const week = await stack.app.inject("/v1/events/week");
    const [today, current, next] = await Promise.all([
      stack.app.inject("/v1/events/today"),
      stack.app.inject("/v1/events/current"),
      stack.app.inject("/v1/events/next"),
    ]);

    expect(week.json<{ count: number }>().count).toBe(10);
    expect(today.json<{ count: number }>().count).toBe(2);
    expect(current.json<{ events: { subject: string }[] }>().events[0]?.subject).toBe(
      "Human Aspects of Management",
    );
    const nextStart = next.json<{ event: { start: string } }>().event.start;
    expect(DateTime.fromISO(nextStart).toFormat("HH:mm")).toBe("13:30");

    // "today" and "current" are answered from the week; "next" looks 14 days ahead.
    expect(stack.aurion.logins).toBe(1);
    expect(stack.aurion.planningAjaxCalls).toHaveLength(2);
  });

  it("logs in again transparently when the Aurion session has expired", async () => {
    const clock = fixedClock("2026-11-18T10:00");
    stack = await createStack(clock);
    await stack.app.inject("/v1/events/today");
    stack.aurion.expireAllSessions();

    const response = await stack.app.inject("/v1/events?from=2026-11-19&to=2026-11-19");
    expect(response.statusCode).toBe(200);
    expect(stack.aurion.logins).toBe(2);
  });

  it("reports wrong credentials as a 502 problem without leaking them", async () => {
    const aurion = new FakeAurion();
    const scraper = new AurionScheduleProvider(
      {
        ...DEFAULTS,
        baseUrl: BASE_URL,
        credentials: new Credentials(VALID_USERNAME, "wrong-pass"),
      },
      { fetch: aurion.fetch },
    );
    const service = new ScheduleService(scraper, fixedClock("2026-11-18T10:00"), DEFAULTS);
    stack = { aurion, app: await buildApp({ service }) };

    const response = await stack.app.inject("/v1/events/today");
    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({ code: "INVALID_CREDENTIALS" });
    expect(response.body).not.toContain("wrong-pass");
    expect(response.body).not.toContain(VALID_USERNAME);
  });
});
