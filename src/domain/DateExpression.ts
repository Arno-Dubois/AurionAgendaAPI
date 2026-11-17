import { DateTime, Duration } from "luxon";
import { InvalidDateExpressionError } from "./errors.js";

/** Which end of a range an expression is used for. */
export type Bound = "from" | "to";

type Anchor = (now: DateTime<true>) => DateTime<true>;

/** Keywords that name a whole day. As a `to` bound they mean "until the end of that day". */
const DAY_ANCHORS: Record<string, Anchor> = {
  today: (now) => now.startOf("day"),
  tomorrow: (now) => now.startOf("day").plus({ days: 1 }),
  yesterday: (now) => now.startOf("day").minus({ days: 1 }),
};

/** Keywords that name an instant. Weeks start on Monday; `endOf…` is exclusive. */
const INSTANT_ANCHORS: Record<string, Anchor> = {
  now: (now) => now,
  startOfWeek: (now) => now.startOf("week"),
  endOfWeek: (now) => now.startOf("week").plus({ weeks: 1 }),
  startOfMonth: (now) => now.startOf("month"),
  endOfMonth: (now) => now.startOf("month").plus({ months: 1 }),
};

const ANCHOR_NAMES = [...Object.keys(INSTANT_ANCHORS), ...Object.keys(DAY_ANCHORS)];
const ANCHOR_LOOKUP = new Map(ANCHOR_NAMES.map((name) => [name.toLowerCase(), name]));

/** `<anchor>`, `<anchor>±<ISO duration>` or `±<ISO duration>` (relative to now). */
const RELATIVE = /^(?<anchor>[a-z]+)?(?:(?<sign>[+-])?(?<duration>P[\dTYMWDHS.,]+))?$/i;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_LENGTH = 64;

const HELP =
  "use an ISO 8601 date or date-time (2026-11-16, 2026-11-16T08:00), a keyword " +
  `(${ANCHOR_NAMES.join(", ")}), an ISO 8601 duration relative to now (+P7D, -PT2H), ` +
  "or a keyword plus a duration (today+P1D, startOfWeek+P1W).";

/**
 * A date as a user types it in a query string, resolved against "now" when needed.
 *
 * | Expression           | `from` resolves to          | `to` resolves to               |
 * | -------------------- | --------------------------- | ------------------------------ |
 * | `2026-11-16`         | 2026-11-16 00:00            | 2026-11-17 00:00 (end of day)  |
 * | `2026-11-16T08:00`   | that instant                | that instant                   |
 * | `now`                | now                         | now                            |
 * | `today`, `tomorrow`  | start of that day           | end of that day                |
 * | `+P7D`, `-PT2H`      | now ± duration              | now ± duration                 |
 * | `today+P2D`          | start of the day in 2 days  | end of the day in 2 days       |
 * | `today+PT8H`         | today 08:00                 | today 08:00                    |
 * | `startOfWeek+P1W`    | next Monday 00:00           | next Monday 00:00              |
 *
 * "Whole day" expressions (a bare date, or a day keyword shifted by days/weeks/months/years)
 * cover the full day when used as `to`, so `?from=today&to=today` is today, and
 * `?from=2026-11-16&to=2026-11-20` is Monday to Friday inclusive.
 *
 * In a URL, `+` decodes to a space; spaces are therefore read as `+`, and both `?to=+P7D`
 * and `?to=%2BP7D` work.
 */
export class DateExpression {
  readonly #resolve: (now: DateTime<true>) => DateTime;

  private constructor(
    readonly source: string,
    readonly zone: string,
    resolve: (now: DateTime<true>) => DateTime,
    /** True when the expression names a whole calendar day rather than an instant. */
    readonly isWholeDay: boolean,
  ) {
    this.#resolve = resolve;
  }

  /** Parses `input`. Dates without an offset are read in `zone`. Throws on bad syntax. */
  static parse(input: string, zone: string): DateExpression {
    const source = input.trimEnd().replaceAll(" ", "+");
    const fail = (detail: string): never => {
      throw new InvalidDateExpressionError(input, detail);
    };
    if (source === "") fail(`it is empty; ${HELP}`);
    if (source.length > MAX_LENGTH) fail(`it is longer than ${MAX_LENGTH} characters.`);

    if (/^\d/.test(source)) {
      const date = DateTime.fromISO(source, { zone, setZone: true });
      if (!date.isValid) fail(`${date.invalidExplanation ?? "not a valid ISO 8601 date"}.`);
      return new DateExpression(source, zone, () => date.setZone(zone), DATE_ONLY.test(source));
    }

    const match = RELATIVE.exec(source)?.groups;
    if (match === undefined || (match.anchor === undefined && match.duration === undefined)) {
      return fail(HELP);
    }
    const { anchor: anchorText, sign, duration: durationText } = match;
    if (anchorText !== undefined && durationText !== undefined && sign === undefined) {
      fail(`put + or - between "${anchorText}" and the duration.`);
    }

    const anchorName = ANCHOR_LOOKUP.get((anchorText ?? "now").toLowerCase());
    if (anchorName === undefined) return fail(`unknown keyword "${anchorText ?? ""}"; ${HELP}`);
    const isDayAnchor = anchorName in DAY_ANCHORS;
    const anchor = DAY_ANCHORS[anchorName] ?? INSTANT_ANCHORS[anchorName];
    if (anchor === undefined) return fail(HELP);

    let offset = Duration.fromMillis(0);
    if (durationText !== undefined) {
      const parsed = Duration.fromISO(durationText.toUpperCase().replace(",", "."));
      if (!parsed.isValid) return fail(`"${durationText}" is not an ISO 8601 duration (P7D…).`);
      offset = sign === "-" ? parsed.negate() : parsed;
    }
    const hasTime = durationText?.toUpperCase().includes("T") ?? false;

    return new DateExpression(
      source,
      zone,
      (now) => anchor(now).plus(offset),
      isDayAnchor && !hasTime,
    );
  }

  /** The instant this expression designates, at `now`, when used as the `bound` of a range. */
  resolve(now: DateTime, bound: Bound): DateTime {
    if (!now.isValid) throw new RangeError("`now` must be a valid DateTime.");
    const instant = this.#resolve(now.setZone(this.zone) as DateTime<true>);
    return this.isWholeDay && bound === "to" ? instant.plus({ days: 1 }) : instant;
  }

  toString(): string {
    return this.source;
  }
}
