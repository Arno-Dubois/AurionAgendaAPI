import { DateTime } from "luxon";
import { beforeEach, describe, expect, it } from "vitest";
import { DateRange } from "../../../src/domain/DateRange.js";
import { AurionUnavailableError } from "../../../src/domain/errors.js";
import { CachedScheduleProvider } from "../../../src/infrastructure/cache/CachedScheduleProvider.js";
import { InMemoryScheduleProvider } from "../../support/InMemoryScheduleProvider.js";

const zone = "Europe/Paris";
const at = (iso: string) => DateTime.fromISO(iso, { zone });
const days = (first: string, last: string) => DateRange.days(at(first), at(last));
const TTL = 60_000;

describe("CachedScheduleProvider", () => {
  let inner: InMemoryScheduleProvider;
  let clock: number;
  let cache: CachedScheduleProvider;

  beforeEach(() => {
    inner = new InMemoryScheduleProvider();
    clock = 0;
    cache = new CachedScheduleProvider(inner, {
      ttlMs: TTL,
      timezone: zone,
      maxRangeDays: 366,
      maxEntries: 3,
      now: () => clock,
    });
  });

  it("answers a range contained in an earlier one without calling the inner provider", async () => {
    const week = await cache.getEvents(days("2026-11-16", "2026-11-22"));
    const thursday = await cache.getEvents(days("2026-11-19", "2026-11-19"));

    expect(inner.calls).toHaveLength(1);
    expect(week).toHaveLength(10);
    expect(thursday.map((e) => e.start.toFormat("HH:mm"))).toEqual(["08:30", "09:30", "15:30"]);
  });

  it("widens misses to whole days so that 'now'-based ranges share one entry", async () => {
    await cache.getEvents(DateRange.of(at("2026-11-19T10:00"), at("2026-11-19T10:01")));
    const later = await cache.getEvents(
      DateRange.of(at("2026-11-19T14:00"), at("2026-11-19T18:00")),
    );

    expect(inner.calls.map(String)).toEqual([
      "[2026-11-19T00:00:00.000+01:00 → 2026-11-20T00:00:00.000+01:00)",
    ]);
    expect(later.map((e) => e.kind)).toEqual(["ASSOCIATIF"]);
  });

  it("does not widen a range that would then exceed the maximum", async () => {
    const fullYear = DateRange.of(at("2026-09-01T12:00"), at("2027-09-02T12:00")); // 366 days
    await cache.getEvents(fullYear);
    expect(inner.calls[0]).toBe(fullYear);
  });

  it("fetches again once the entry has expired", async () => {
    const week = days("2026-11-16", "2026-11-22");
    await cache.getEvents(week);
    clock = TTL - 1;
    await cache.getEvents(week);
    expect(inner.calls).toHaveLength(1);

    clock = TTL;
    await cache.getEvents(week);
    expect(inner.calls).toHaveLength(2);
  });

  it("shares one fetch between concurrent requests (single-flight)", async () => {
    const week = days("2026-11-16", "2026-11-22");
    const results = await Promise.all([
      cache.getEvents(week),
      cache.getEvents(week),
      cache.getEvents(days("2026-11-17", "2026-11-18")),
    ]);
    expect(inner.calls).toHaveLength(1);
    expect(results.map((r) => r.length)).toEqual([10, 10, 4]);
  });

  it("does not cache failures", async () => {
    const week = days("2026-11-16", "2026-11-22");
    inner.failNextWith = new AurionUnavailableError("down");
    await expect(cache.getEvents(week)).rejects.toThrow(AurionUnavailableError);
    expect(cache.size).toBe(0);

    await expect(cache.getEvents(week)).resolves.toHaveLength(10);
    expect(inner.calls).toHaveLength(2);
  });

  it("keeps at most maxEntries entries, dropping the oldest", async () => {
    for (const day of ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19"]) {
      await cache.getEvents(days(day, day));
    }
    expect(cache.size).toBe(3);
    await cache.getEvents(days("2026-11-16", "2026-11-16"));
    expect(inner.calls).toHaveLength(5);
  });

  it("can be cleared", async () => {
    await cache.getEvents(days("2026-11-16", "2026-11-16"));
    cache.clear();
    await cache.getEvents(days("2026-11-16", "2026-11-16"));
    expect(inner.calls).toHaveLength(2);
  });

  it("passes every call through when the TTL is 0", async () => {
    const passthrough = new CachedScheduleProvider(inner, {
      ttlMs: 0,
      timezone: zone,
      maxRangeDays: 366,
    });
    const range = DateRange.of(at("2026-11-19T10:00"), at("2026-11-19T11:00"));
    await passthrough.getEvents(range);
    await passthrough.getEvents(range);
    expect(inner.calls).toEqual([range, range]);
  });
});
