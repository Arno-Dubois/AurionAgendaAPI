import { z } from "zod";
import { parseEnv, positiveInt } from "./env.js";

export interface ServerConfig {
  host: string;
  port: number;
  /** When set, every /v1 request needs `Authorization: Bearer <token>`. */
  apiToken: string | null;
  /** How long Aurion responses are reused. 0 disables the cache. */
  cacheTtlSeconds: number;
  logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
}

export const SERVER_DEFAULTS = {
  host: "127.0.0.1",
  port: 3000,
  cacheTtlSeconds: 900,
  logLevel: "info",
} as const;

const EnvSchema = z.object({
  HOST: z.string().default(SERVER_DEFAULTS.host),
  PORT: positiveInt(SERVER_DEFAULTS.port).pipe(z.number().max(65_535)),
  API_TOKEN: z
    .string()
    .min(16, "must be at least 16 characters (try: openssl rand -hex 32)")
    .optional(),
  CACHE_TTL_SECONDS: z.coerce.number().int().nonnegative().default(SERVER_DEFAULTS.cacheTtlSeconds),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default(SERVER_DEFAULTS.logLevel),
});

/** Reads and validates the HTTP server settings from environment variables. */
export function loadServerConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const e = parseEnv(EnvSchema, env);
  return {
    host: e.HOST,
    port: e.PORT,
    apiToken: e.API_TOKEN ?? null,
    cacheTtlSeconds: e.CACHE_TTL_SECONDS,
    logLevel: e.LOG_LEVEL,
  };
}
