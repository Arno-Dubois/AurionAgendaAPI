import { beforeEach, describe, expect, it } from "vitest";
import { ScheduleService } from "../../../src/application/ScheduleService.js";
import {
  InvalidDateExpressionError,
  InvalidRangeError,
  RangeTooLargeError,
} from "../../../src/domain/errors.js";
import { fixedClock, InMemoryScheduleProvider } from "../../support/InMemoryScheduleProvider.js";

describe("ScheduleService (recorded school year, Thursday 19 Nov 2026 10:00)", () => {
  let provider: InMemoryScheduleProvider;
  let clock: ReturnType<typeof fixedClock>;
  let service: ScheduleService;

  beforeEach(() => {
    provider = new InMemoryScheduleProvider();
    clock = fixedClock("2026-11-19T10:00");
    service = new ScheduleService(provider, clock, {
      timezone: "Europe/Paris",
      maxRangeDays: 366,
    });
  });

  it("returns the events between two expressions, with the resolved range", async () => {
    const { range, events } = await service.between("2026-11-16", "2026-11-20");
    expect(range.toString()).toBe(
      "[2026-11-16T00:00:00.000+01:00 → 2026-11-21T00:00:00.000+01:00)",
    );
    expect(events).toHaveLength(10);
  });

  it("resolves relative expressions against the clock", async () => {
    const { range, events } = await service.between("now", "+PT6H");
    expect(range.toString()).toBe(
      "[2026-11-19T10:00:00.000+01:00 → 2026-11-19T16:00:00.000+01:00)",
    );
    expect(events.map((e) => e.kind)).toEqual(["TP", "ASSOCIATIF"]);
  });

  it("returns today's events", async () => {
    const { events } = await service.today();
    expect(events.map((e) => e.start.toFormat("HH:mm"))).toEqual(["08:30", "09:30", "15:30"]);
  });

  it("returns whole weeks, Monday to Sunday", async () => {
    const thisWeek = await service.week();
    expect(thisWeek.range.from.toISODate()).toBe("2026-11-16");
    expect(thisWeek.range.to.toISODate()).toBe("2026-11-23");
    expect(thisWeek.events).toHaveLength(10);

    const nextWeek = await service.week(1);
    expect(nextWeek.range.from.toISODate()).toBe("2026-11-23");
    expect(nextWeek.events.filter((e) => e.isExam)).toHaveLength(1);
  });

  it("finds the events in progress", async () => {
    const { at, events } = await service.current();
    expect(at.toISO()).toBe("2026-11-19T10:00:00.000+01:00");
    expect(events.map((e) => [e.kind, e.start.toFormat("HH:mm")])).toEqual([["TP", "09:30"]]);

    clock.set("2026-11-19T13:00");
    expect((await service.current()).events).toEqual([]);
  });

  it("treats an event's end as exclusive", async () => {
    clock.set("2026-11-19T09:30");
    const { events } = await service.current();
    expect(events.map((e) => e.kind)).toEqual(["TP"]);
  });

  it("finds the next event, skipping the one in progress", async () => {
    const { event } = await service.next();
    expect(event?.kind).toBe("ASSOCIATIF");
    expect(event?.start.toISO()).toBe("2026-11-19T15:30:00.000+01:00");
    expect(provider.calls).toHaveLength(1);
  });

  it("looks further than two weeks ahead when needed (Christmas holidays)", async () => {
    clock.set("2026-12-19T10:00");
    const { event } = await service.next();
    expect(event?.start.toISO()).toBe("2027-01-04T08:30:00.000+01:00");
    expect(provider.calls).toHaveLength(2);
  });

  it("returns null when nothing else is planned", async () => {
    clock.set("2027-05-04T10:00");
    expect((await service.next()).event).toBeNull();
  });

  it("validates input before contacting the provider", async () => {
    await expect(service.between("2026-01-01", "2027-06-30")).rejects.toThrow(RangeTooLargeError);
    await expect(service.between("tomorow", "today")).rejects.toThrow(InvalidDateExpressionError);
    await expect(service.between("tomorrow", "today")).rejects.toThrow(InvalidRangeError);
    expect(provider.calls).toHaveLength(0);
  });

  it("works with a range limit shorter than the next() lookahead", async () => {
    const short = new ScheduleService(provider, clock, {
      timezone: "Europe/Paris",
      maxRangeDays: 7,
    });
    clock.set("2026-12-19T10:00");
    expect((await short.next()).event).toBeNull();
    expect(provider.calls).toHaveLength(1);
  });
});
