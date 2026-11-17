import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { DateExpression, type Bound } from "../../../src/domain/DateExpression.js";
import { InvalidDateExpressionError } from "../../../src/domain/errors.js";

const zone = "Europe/Paris";
// Wednesday 18 November 2026, 10:30 in Paris.
const now = DateTime.fromISO("2026-11-18T10:30:00", { zone });

const resolve = (expression: string, bound: Bound, at: DateTime = now) =>
    DateExpression.parse(expression, zone).resolve(at, bound).toISO();

describe("DateExpression", () => {
    describe("absolute ISO 8601", () => {
        it("reads a bare date as the start of that day, or its end when used as `to`", () => {
            expect(resolve("2026-11-16", "from")).toBe("2026-11-16T00:00:00.000+01:00");
            expect(resolve("2026-11-20", "to")).toBe("2026-11-21T00:00:00.000+01:00");
            expect(DateExpression.parse("2026-11-16", zone).isWholeDay).toBe(true);
        });

        it("reads a date-time without offset in the configured zone, as an instant", () => {
            expect(resolve("2026-11-16T08:00", "from")).toBe("2026-11-16T08:00:00.000+01:00");
            expect(resolve("2026-11-16T08:00", "to")).toBe("2026-11-16T08:00:00.000+01:00");
            expect(DateExpression.parse("2026-11-16T08:00", zone).isWholeDay).toBe(false);
        });

        it("honours an explicit offset and converts it to the zone", () => {
            expect(resolve("2026-11-16T08:00Z", "from")).toBe("2026-11-16T09:00:00.000+01:00");
            expect(resolve("2026-11-16T08:00-05:00", "from")).toBe("2026-11-16T14:00:00.000+01:00");
        });

        it("accepts a + offset that URL decoding turned into a space", () => {
            expect(resolve("2026-11-16T08:00 02:00", "from")).toBe("2026-11-16T07:00:00.000+01:00");
        });

        it("is independent of `now`", () => {
            const later = now.plus({ years: 3 });
            expect(resolve("2026-11-16", "from", later)).toBe("2026-11-16T00:00:00.000+01:00");
        });
    });

    describe("keywords", () => {
        it.each([
            ["now", "2026-11-18T10:30:00.000+01:00", "2026-11-18T10:30:00.000+01:00"],
            ["today", "2026-11-18T00:00:00.000+01:00", "2026-11-19T00:00:00.000+01:00"],
            ["tomorrow", "2026-11-19T00:00:00.000+01:00", "2026-11-20T00:00:00.000+01:00"],
            ["yesterday", "2026-11-17T00:00:00.000+01:00", "2026-11-18T00:00:00.000+01:00"],
            ["startOfWeek", "2026-11-16T00:00:00.000+01:00", "2026-11-16T00:00:00.000+01:00"],
            ["endOfWeek", "2026-11-23T00:00:00.000+01:00", "2026-11-23T00:00:00.000+01:00"],
            ["startOfMonth", "2026-11-01T00:00:00.000+01:00", "2026-11-01T00:00:00.000+01:00"],
            ["endOfMonth", "2026-12-01T00:00:00.000+01:00", "2026-12-01T00:00:00.000+01:00"],
        ])("%s → from %s, to %s", (keyword, from, to) => {
            expect(resolve(keyword, "from")).toBe(from);
            expect(resolve(keyword, "to")).toBe(to);
        });

        it("is case-insensitive", () => {
            expect(resolve("TODAY", "from")).toBe(resolve("today", "from"));
            expect(resolve("startofweek", "from")).toBe(resolve("startOfWeek", "from"));
        });

        it("starts weeks on Monday, even on a Sunday", () => {
            const sunday = DateTime.fromISO("2026-11-22T20:00", { zone });
            expect(resolve("startOfWeek", "from", sunday)).toBe("2026-11-16T00:00:00.000+01:00");
        });

        it("uses the zone's date, not the UTC one", () => {
            // 23:30 UTC on the 18th is already the 19th in Paris.
            const lateUtc = DateTime.fromISO("2026-11-18T23:30:00Z");
            expect(resolve("today", "from", lateUtc)).toBe("2026-11-19T00:00:00.000+01:00");
        });
    });

    describe("durations relative to now", () => {
        it.each([
            ["+P7D", "2026-11-25T10:30:00.000+01:00"],
            ["P7D", "2026-11-25T10:30:00.000+01:00"],
            [" P7D", "2026-11-25T10:30:00.000+01:00"], // "+P7D" after URL decoding
            ["-PT2H", "2026-11-18T08:30:00.000+01:00"],
            ["+P1W", "2026-11-25T10:30:00.000+01:00"],
            ["+P1M", "2026-12-18T10:30:00.000+01:00"],
            ["+PT1H30M", "2026-11-18T12:00:00.000+01:00"],
            ["+PT0,5H", "2026-11-18T11:00:00.000+01:00"],
            ["+p7d", "2026-11-25T10:30:00.000+01:00"],
        ])("%s → %s", (expression, expected) => {
            expect(resolve(expression, "from")).toBe(expected);
            expect(resolve(expression, "to")).toBe(expected);
        });
    });

    describe("keyword plus duration", () => {
        it("keeps whole-day semantics when shifting a day keyword by days", () => {
            expect(resolve("today+P2D", "from")).toBe("2026-11-20T00:00:00.000+01:00");
            expect(resolve("today+P2D", "to")).toBe("2026-11-21T00:00:00.000+01:00");
            expect(resolve("today+P6D", "to")).toBe("2026-11-25T00:00:00.000+01:00");
            expect(resolve("tomorrow-P1W", "from")).toBe("2026-11-12T00:00:00.000+01:00");
        });

        it("becomes an instant when the duration has a time part", () => {
            expect(resolve("today+PT8H", "from")).toBe("2026-11-18T08:00:00.000+01:00");
            expect(resolve("today+PT8H", "to")).toBe("2026-11-18T08:00:00.000+01:00");
            expect(DateExpression.parse("today+PT8H", zone).isWholeDay).toBe(false);
        });

        it("shifts instant keywords", () => {
            expect(resolve("startOfWeek+P1W", "from")).toBe("2026-11-23T00:00:00.000+01:00");
            expect(resolve("endOfWeek+P1W", "to")).toBe("2026-11-30T00:00:00.000+01:00");
            expect(resolve("now-P1D", "to")).toBe("2026-11-17T10:30:00.000+01:00");
            expect(resolve("startOfMonth+P1M", "from")).toBe("2026-12-01T00:00:00.000+01:00");
        });
    });

    describe("daylight saving time (Paris leaves summer time on 2026-10-25)", () => {
        const saturday = DateTime.fromISO("2026-10-24T12:00", { zone });

        it("keeps midnight on both sides of the change", () => {
            expect(resolve("tomorrow", "from", saturday)).toBe("2026-10-25T00:00:00.000+02:00");
            expect(resolve("tomorrow", "to", saturday)).toBe("2026-10-26T00:00:00.000+01:00");
        });

        it("adds calendar days, keeping the wall-clock time", () => {
            expect(resolve("+P1D", "from", saturday)).toBe("2026-10-25T12:00:00.000+01:00");
            expect(resolve("+PT24H", "from", saturday)).toBe("2026-10-25T11:00:00.000+01:00");
        });
    });

    describe("errors", () => {
        it.each([
            ["", /empty/],
            ["   ", /empty/],
            ["tomorow", /unknown keyword "tomorow"/],
            ["+7D", /use an ISO 8601 date/],
            ["todayP1D", /put \+ or - between "todayP1D"|put \+ or -/],
            ["today+", /use an ISO 8601 date/],
            ["+P1", /not an ISO 8601 duration/],
            ["+PXD", /use an ISO 8601 date/],
            ["2026-13-01", /month/i],
            ["2026-11-16T25:00", /hour/i],
            ["2026-11-16+P1D", /./],
            ["x".repeat(65), /longer than 64/],
        ])("rejects %j", (input, message) => {
            const parse = () => DateExpression.parse(input, zone);
            expect(parse).toThrow(InvalidDateExpressionError);
            expect(parse).toThrow(message);
        });

        it("exposes a stable error code and the original input", () => {
            try {
                DateExpression.parse("soon", zone);
                expect.fail("should have thrown");
            } catch (error) {
                expect(error).toBeInstanceOf(InvalidDateExpressionError);
                expect((error as InvalidDateExpressionError).code).toBe("INVALID_DATE_EXPRESSION");
                expect((error as InvalidDateExpressionError).expression).toBe("soon");
            }
        });

        it("lists the accepted forms when nothing matches", () => {
            expect(() => DateExpression.parse("next monday", zone)).toThrow(/startOfWeek.*\+P7D/);
        });
    });

    it("prints its normalised source", () => {
        expect(DateExpression.parse(" P7D", zone).toString()).toBe("+P7D");
    });
});
