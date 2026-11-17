/**
 * Manual check against the real Aurion, using credentials from `.env`:
 *
 *   pnpm events                                   # today + 7 days
 *   pnpm events -- --from 2026-11-16 --to 2026-11-30
 *   pnpm events -- --from 2026-11-16 --to 2026-11-30 --json
 */
import { parseArgs } from "node:util";
import { DateTime } from "luxon";
import { ConfigError, loadConfigFromEnv } from "./config/AurionConfig.js";
import type { CourseEvent } from "./domain/CourseEvent.js";
import { DateRange } from "./domain/DateRange.js";
import { AurionAgendaError } from "./domain/errors.js";
import { AurionScheduleProvider } from "./infrastructure/aurion/AurionScheduleProvider.js";

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      from: { type: "string" },
      to: { type: "string" },
      json: { type: "boolean", default: false },
    },
  });

  const config = loadConfigFromEnv();
  const zone = config.timezone;
  const from = values.from
    ? DateTime.fromISO(values.from, { zone })
    : DateTime.now().setZone(zone).startOf("day");
  // A bare date as --to means "until the end of that day".
  const to = values.to ? endOfInput(values.to, zone) : from.plus({ days: 7 });
  const range = DateRange.of(from, to);

  const provider = new AurionScheduleProvider(config);
  const started = performance.now();
  const events = await provider.getEvents(range);
  const elapsed = Math.round(performance.now() - started);

  if (values.json) {
    console.log(JSON.stringify(events, null, 2));
  } else {
    printTable(events);
    console.error(`\n${events.length} events in ${range.toString()} (${elapsed} ms)`);
  }
  return 0;
}

function endOfInput(value: string, zone: string): DateTime {
  const date = DateTime.fromISO(value, { zone });
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? date.plus({ days: 1 }).startOf("day") : date;
}

function printTable(events: readonly CourseEvent[]): void {
  let currentDay = "";
  for (const event of events) {
    const day = event.start.toFormat("cccc dd/LL/yyyy");
    if (day !== currentDay) {
      console.log(`\n${day}`);
      currentDay = day;
    }
    const time = `${event.start.toFormat("HH:mm")}-${event.end.toFormat("HH:mm")}`;
    const details = [event.isExam ? "EXAM" : null, event.kind, event.room, event.teacher]
      .filter(Boolean)
      .join(" | ");
    console.log(`  ${time}  ${event.title}  [${details}]`);
    // Without a subject, the first description line is already the title.
    const lines = event.description?.split("\n").filter(Boolean) ?? [];
    for (const line of event.subject === null ? lines.slice(1) : lines) {
      console.log(`${" ".repeat(15)}${line}`);
    }
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    if (error instanceof ConfigError || error instanceof AurionAgendaError) {
      console.error(`${error.name}: ${error.message}`);
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  },
);
