/**
 * Manual check against the real Aurion, using credentials from `.env`:
 *
 *   pnpm events                                   # today + 6 days
 *   pnpm events --from 2026-11-16 --to 2026-11-30
 *   pnpm events --from now --to +P1D --json
 *
 * `--from` / `--to` accept the same expressions as the API (see DateExpression).
 */
import { parseArgs } from "node:util";
import { ScheduleService } from "./application/ScheduleService.js";
import { ConfigError, loadConfigFromEnv } from "./config/AurionConfig.js";
import type { CourseEvent } from "./domain/CourseEvent.js";
import { AurionAgendaError } from "./domain/errors.js";
import { AurionScheduleProvider } from "./infrastructure/aurion/AurionScheduleProvider.js";
import { systemClock } from "./ports/Clock.js";

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      from: { type: "string" },
      to: { type: "string" },
      json: { type: "boolean", default: false },
    },
  });

  const config = loadConfigFromEnv();
  const service = new ScheduleService(new AurionScheduleProvider(config), systemClock, config);
  const started = performance.now();
  const { range, events } = await service.between(values.from ?? "today", values.to ?? "today+P6D");
  const elapsed = Math.round(performance.now() - started);

  if (values.json) {
    console.log(JSON.stringify(events, null, 2));
  } else {
    printTable(events);
    console.error(`\n${events.length} events in ${range.toString()} (${elapsed} ms)`);
  }
  return 0;
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
