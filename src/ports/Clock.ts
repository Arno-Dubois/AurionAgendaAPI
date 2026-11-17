import { DateTime } from "luxon";

/** Source of "now", injected so relative dates ("today", "+P7D") are testable. */
export interface Clock {
  now(): DateTime<true>;
}

export const systemClock: Clock = {
  now: () => DateTime.now(),
};
