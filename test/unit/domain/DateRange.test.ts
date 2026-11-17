import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { DateRange } from "../../../src/domain/DateRange.js";
import { InvalidRangeError } from "../../../src/domain/errors.js";

const zone = "Europe/Paris";
const at = (iso: string) => DateTime.fromISO(iso, { zone });

describe("DateRange", () => {
  it("rejects an end before or equal to the start", () => {
    expect(() => DateRange.of(at("2026-11-16T10:00"), at("2026-11-16T10:00"))).toThrow(
      InvalidRangeError,
    );
    expect(() => DateRange.of(at("2026-11-17"), at("2026-11-16"))).toThrow(InvalidRangeError);
  });

  it("rejects invalid dates", () => {
    expect(() => DateRange.fromISO("not-a-date", "2026-11-16", zone)).toThrow(/Invalid start date/);
  });

  it("builds whole days with DateRange.days", () => {
    const range = DateRange.days(at("2026-11-16T15:30"), at("2026-11-20T08:00"));
    expect(range.from.toISO()).toBe("2026-11-16T00:00:00.000+01:00");
    expect(range.to.toISO()).toBe("2026-11-21T00:00:00.000+01:00");
    expect(range.durationInDays).toBe(5);
  });

  it("detects overlapping events with a half-open interval", () => {
    const range = DateRange.of(at("2026-11-16T10:00"), at("2026-11-16T12:00"));
    expect(range.overlaps({ start: at("2026-11-16T09:00"), end: at("2026-11-16T10:30") })).toBe(
      true,
    );
    expect(range.overlaps({ start: at("2026-11-16T11:59"), end: at("2026-11-16T13:00") })).toBe(
      true,
    );
    expect(range.overlaps({ start: at("2026-11-16T08:00"), end: at("2026-11-16T10:00") })).toBe(
      false,
    );
    expect(range.overlaps({ start: at("2026-11-16T12:00"), end: at("2026-11-16T13:00") })).toBe(
      false,
    );
  });

  it("pads and aligns to whole UTC days, like the Aurion calendar widget", () => {
    // Monday 16 Nov 2026 00:00 Paris = Sunday 15 Nov 23:00 UTC
    const week = DateRange.days(at("2026-11-16"), at("2026-11-21"));
    const aligned = week.toWholeUtcDays();
    expect(aligned.from.toISO()).toBe("2026-11-15T00:00:00.000Z");
    expect(aligned.to.toISO()).toBe("2026-11-22T00:00:00.000Z");

    const padded = week.pad(1).toWholeUtcDays();
    expect(padded.from.toISO()).toBe("2026-11-14T00:00:00.000Z");
    expect(padded.to.toISO()).toBe("2026-11-23T00:00:00.000Z");
  });

  it("keeps an already aligned UTC range unchanged", () => {
    const range = DateRange.fromISO("2026-11-16T00:00Z", "2026-11-22T00:00Z", "utc");
    expect(range.toWholeUtcDays().toString()).toBe(range.toString());
  });
});
