/**
 * Composition root: reads the configuration, wires the objects together and starts the
 * HTTP server.
 *
 *   pnpm dev      # watch mode, reads .env
 *   pnpm start    # after pnpm build
 */
import { readFileSync } from "node:fs";
import { ScheduleService } from "./application/ScheduleService.js";
import { ConfigError, loadConfigFromEnv } from "./config/AurionConfig.js";
import { loadServerConfigFromEnv } from "./config/ServerConfig.js";
import { buildApp } from "./http/app.js";
import { AurionScheduleProvider } from "./infrastructure/aurion/AurionScheduleProvider.js";
import { CachedScheduleProvider } from "./infrastructure/cache/CachedScheduleProvider.js";
import { ICalExporter } from "./infrastructure/ical/ICalExporter.js";
import { systemClock } from "./ports/Clock.js";

async function main(): Promise<void> {
  const aurion = loadConfigFromEnv();
  const server = loadServerConfigFromEnv();
  const { version } = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version: string };

  const provider = new CachedScheduleProvider(new AurionScheduleProvider(aurion), {
    ttlMs: server.cacheTtlSeconds * 1000,
    timezone: aurion.timezone,
    maxRangeDays: aurion.maxRangeDays,
  });
  const service = new ScheduleService(provider, systemClock, {
    timezone: aurion.timezone,
    maxRangeDays: aurion.maxRangeDays,
  });
  const app = await buildApp({
    service,
    apiToken: server.apiToken,
    calendar:
      server.calendarToken === null
        ? null
        : { token: server.calendarToken, name: server.calendarName, exporter: new ICalExporter() },
    version,
    logger: {
      level: server.logLevel,
      redact: ["req.headers.authorization"],
    },
  });

  if (server.apiToken === null && !["127.0.0.1", "localhost", "::1"].includes(server.host)) {
    app.log.warn(
      `Listening on ${server.host} without API_TOKEN: anyone who can reach it can read your timetable.`,
    );
  }

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      app.log.info(`${signal} received, shutting down`);
      void app.close().then(() => process.exit(0));
    });
  }

  await app.listen({ host: server.host, port: server.port });
  const base = `http://${server.host}:${server.port}`;
  app.log.info(`API docs at ${base}/docs`);
  // The token itself is never logged.
  app.log.info(
    server.calendarToken === null
      ? "iCal feed disabled (set CALENDAR_TOKEN to enable it)"
      : `iCal feed at ${base}/cal/<CALENDAR_TOKEN>.ics`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof ConfigError ? error.message : error);
  process.exit(1);
});
