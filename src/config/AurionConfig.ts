import { IANAZone } from "luxon";
import { z } from "zod";
import { Credentials } from "../domain/Credentials.js";
import { parseEnv, positiveInt } from "./env.js";

export { ConfigError } from "./env.js";

export interface AurionConfig {
  baseUrl: URL;
  credentials: Credentials;
  /** IANA zone used to interpret dates without an offset ("2026-11-16") and to output events. */
  timezone: string;
  /** CSS class of the "My Schedule" link in the sidebar. Differs between Aurion instances. */
  planningMenuItemClass: string;
  /** Longest range one call may request. Aurion itself answers a whole year in one response. */
  maxRangeDays: number;
  requestTimeoutMs: number;
}

export const DEFAULTS = {
  baseUrl: "https://aurion.junia.com",
  timezone: "Europe/Paris",
  planningMenuItemClass: "item_2169484",
  maxRangeDays: 366,
  requestTimeoutMs: 30_000,
} as const;

const EnvSchema = z.object({
  AURION_USERNAME: z.string({ error: "is required" }).trim().min(1, "is required"),
  AURION_PASSWORD: z.string({ error: "is required" }).min(1, "is required"),
  AURION_BASE_URL: z.url().default(DEFAULTS.baseUrl),
  AURION_TIMEZONE: z
    .string()
    .default(DEFAULTS.timezone)
    .refine((zone) => IANAZone.isValidZone(zone), "must be an IANA zone such as Europe/Paris"),
  AURION_PLANNING_MENU_ITEM: z
    .string()
    .regex(/^[\w-]+$/, "must be a bare CSS class name")
    .default(DEFAULTS.planningMenuItemClass),
  AURION_MAX_RANGE_DAYS: positiveInt(DEFAULTS.maxRangeDays),
  AURION_REQUEST_TIMEOUT_MS: positiveInt(DEFAULTS.requestTimeoutMs),
});

/** Reads and validates configuration from environment variables. */
export function loadConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AurionConfig {
  const e = parseEnv(EnvSchema, env);
  return {
    baseUrl: new URL(e.AURION_BASE_URL),
    credentials: new Credentials(e.AURION_USERNAME, e.AURION_PASSWORD),
    timezone: e.AURION_TIMEZONE,
    planningMenuItemClass: e.AURION_PLANNING_MENU_ITEM,
    maxRangeDays: e.AURION_MAX_RANGE_DAYS,
    requestTimeoutMs: e.AURION_REQUEST_TIMEOUT_MS,
  };
}
