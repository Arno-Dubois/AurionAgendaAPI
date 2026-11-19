# AurionAgendaAPI

Self-hosted TypeScript service that reads your timetable from **Aurion** (the JUNIA student
portal) and exposes it as a JSON REST API and as an iCal feed you can subscribe to from
Google Calendar, Apple Calendar or Outlook.

> **Status:** milestone 3 of the [roadmap](#roadmap). The scraper, a CLI, the REST API and the iCal feed work; Docker packaging is next.

```text
$ curl 'localhost:3000/v1/events/next'
{"at":"2026-11-18T10:00:00.000+01:00","timezone":"Europe/Paris","event":{"title":"Optimisation energétique des systèmes numériques embarqués","start":"2026-11-18T13:30:00.000+01:00",…}}
```

```text
$ pnpm events --from 2026-11-16 --to 2026-11-20

Monday 16/11/2026
  09:00-12:00  Human Aspects of Management  [COURS_TD | BORDEAUX_032_SALLE_CODESIGN | Mr …]
               annulé sera décalé

Tuesday 17/11/2026
  09:00-12:00  Human Aspects of Management  [COURS_TD | BORDEAUX_032_SALLE_CODESIGN | Mr …]
  13:30-17:30  Optimisation energétique des systèmes numériques embarqués  [COURS_TD | BORDEAUX_159_TP_MIXTE | Mr …]
…
```

## Why self-hosted?

Calendar apps refresh iCal feeds unattended, so whoever runs the server needs your Aurion
password. Rather than collecting other students' passwords, each person runs their own
instance with their own credentials in a local `.env` file. The password never leaves your
machine except to log in to Aurion.

## Quick start

Requires [pnpm](https://pnpm.io). pnpm downloads the Node.js version the project pins
(24 LTS, `devEngines.runtime` in `package.json`), so your system Node does not matter.

```bash
pnpm install
cp .env.example .env      # then fill in AURION_USERNAME / AURION_PASSWORD
pnpm dev                  # API on http://127.0.0.1:3000, docs on /docs
```

Or, without the server:

```bash
pnpm events                                   # the next 7 days in the terminal
pnpm events --from 2026-09-01 --to 2027-06-30 --json > year.json
```

For a long-running instance: `pnpm build && pnpm start`.

| Variable                             | Default                    |                                                                                                 |
| ------------------------------------ | -------------------------- | ----------------------------------------------------------------------------------------------- |
| `AURION_USERNAME`, `AURION_PASSWORD` | (required)                 | your Aurion login                                                                               |
| `AURION_BASE_URL`                    | `https://aurion.junia.com` |                                                                                                 |
| `AURION_TIMEZONE`                    | `Europe/Paris`             | zone for dates without an offset and for output                                                 |
| `AURION_PLANNING_MENU_ITEM`          | `item_2169484`             | CSS class of the "My Schedule" sidebar link. If it is wrong, the error lists the available ones |
| `AURION_MAX_RANGE_DAYS`              | `366`                      | longest range one call may request                                                              |
| `AURION_REQUEST_TIMEOUT_MS`          | `30000`                    | a whole school year takes about 5 s                                                             |
| `HOST`, `PORT`                       | `127.0.0.1`, `3000`        | the API only listens locally unless you change `HOST`                                           |
| `API_TOKEN`                          | (none)                     | when set, `/v1` requires `Authorization: Bearer <token>`. Set it before exposing the API        |
| `CALENDAR_TOKEN`                     | (none, feed disabled)      | secret part of the [iCal feed](#calendar-subscription-ical) URL: letters, digits, `-`, `_`      |
| `CALENDAR_NAME`                      | `Aurion timetable`         | name calendar apps show for the subscription                                                    |
| `CACHE_TTL_SECONDS`                  | `900`                      | how long Aurion answers are reused; `0` disables the cache                                      |
| `LOG_LEVEL`                          | `info`                     | `debug`, `warn`, `silent`…                                                                      |

## REST API

Interactive documentation (OpenAPI 3, generated from the zod schemas) is served on
[`/docs`](http://127.0.0.1:3000/docs), and the raw spec on `/docs/json`.

| Endpoint                       |                                                                   |
| ------------------------------ | ----------------------------------------------------------------- |
| `GET /v1/events?from=…&to=…`   | events overlapping `[from, to)`; defaults to the next 7 days      |
| `GET /v1/events/today`         | today's events                                                    |
| `GET /v1/events/week?offset=0` | Monday to Sunday; `1` is next week, `-1` last week                |
| `GET /v1/events/current`       | events in progress right now                                      |
| `GET /v1/events/next`          | the next event to start, even after the holidays (`null` if none) |
| `GET /health`                  | liveness, does not contact Aurion                                 |
| `GET /cal/<token>.ics`         | the [iCal feed](#calendar-subscription-ical)                      |

`from` and `to` accept absolute or relative dates:

| Expression                                               | Meaning                                                          |
| -------------------------------------------------------- | ---------------------------------------------------------------- |
| `2026-11-16`                                             | that day; as `to`, the **end** of that day                       |
| `2026-11-16T08:00`, `2026-11-16T07:00Z`                  | an instant (local time in `AURION_TIMEZONE` without offset)      |
| `now`, `today`, `tomorrow`, `yesterday`                  | day keywords behave like a date: `?from=today&to=today` is today |
| `startOfWeek`, `endOfWeek`, `startOfMonth`, `endOfMonth` | boundaries; weeks start on Monday, `endOf…` is exclusive         |
| `+P7D`, `-PT2H`                                          | ISO 8601 duration from now                                       |
| `today+P1D`, `startOfWeek+P1W`, `today+PT8H`             | keyword shifted by a duration                                    |

```bash
curl 'localhost:3000/v1/events?from=2026-11-16&to=2026-11-20'   # Monday to Friday
curl 'localhost:3000/v1/events?from=now&to=+P7D'                # + may stay unencoded
curl 'localhost:3000/v1/events?from=startOfMonth&to=endOfMonth'
```

Ranges are limited to `AURION_MAX_RANGE_DAYS`. Errors are
[RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) problem documents with a stable `code`:

```json
{
  "type": "about:blank",
  "title": "Bad Request",
  "status": 400,
  "detail": "Invalid date expression \"tomorow\": unknown keyword \"tomorow\"; use …",
  "code": "INVALID_DATE_EXPRESSION"
}
```

| Status | `code`                                                                           | When                                              |
| ------ | -------------------------------------------------------------------------------- | ------------------------------------------------- |
| 400    | `INVALID_REQUEST`, `INVALID_DATE_EXPRESSION`, `INVALID_RANGE`, `RANGE_TOO_LARGE` | bad parameters, nothing was sent to Aurion        |
| 401    | `UNAUTHORIZED`                                                                   | `API_TOKEN` is set and the token is missing/wrong |
| 502    | `INVALID_CREDENTIALS`, `AURION_LAYOUT_CHANGED`                                   | Aurion rejected the login, or its pages changed   |
| 503    | `AURION_UNAVAILABLE`                                                             | Aurion is down or slow (`Retry-After: 60`)        |

Responses carry `Cache-Control: no-store`: a timetable is personal data.

Each event looks like this (`--json`):

```json
{
  "id": "06b4ba90-5f72-4cca-b4c5-fe673eac7f53",
  "start": "2026-11-16T09:00:00.000+01:00",
  "end": "2026-11-16T12:00:00.000+01:00",
  "title": "Human Aspects of Management",
  "subject": "Human Aspects of Management",
  "description": "annulé sera décalé",
  "room": "BORDEAUX_032_SALLE_CODESIGN",
  "kind": "COURS_TD",
  "teacher": "Mr …",
  "isExam": false
}
```

`title` is the subject, or the first line of the description for events without one
(meetings, talks, workshops).

## Calendar subscription (iCal)

Generate a secret and add it to `.env`, then restart the server:

```bash
echo "CALENDAR_TOKEN=$(openssl rand -hex 32)" >> .env
```

The feed is then served on:

```text
http://127.0.0.1:3000/cal/<CALENDAR_TOKEN>.ics?pastWeeks=2&futureWeeks=8
```

| Parameter     | Default | Meaning                                      |
| ------------- | ------- | -------------------------------------------- |
| `pastWeeks`   | `2`     | whole weeks before the current one (0 to 52) |
| `futureWeeks` | `8`     | whole weeks after the current one (0 to 52)  |

The range always starts on a Monday and ends on a Sunday, so it stays the same all week and
repeated refreshes are answered from the cache. Each event becomes:

| iCal property | Content                                                                     |
| ------------- | --------------------------------------------------------------------------- |
| `UID`         | the Aurion event id, so refreshes update events instead of duplicating them |
| `SUMMARY`     | the title, prefixed with `[EXAM]` for exams                                 |
| `LOCATION`    | the Aurion room code                                                        |
| `DESCRIPTION` | the school's free text, then the teacher and the session kind               |
| `CATEGORIES`  | the session kind (`COURS_TD`, `TP`…) and `EXAM`                             |
| `DTSTART/END` | UTC; apps show them in your zone (`X-WR-TIMEZONE` is `AURION_TIMEZONE`)     |

The feed asks apps to refresh every hour (`REFRESH-INTERVAL` and `X-PUBLISHED-TTL`).

**Subscribing.** Calendar apps fetch the feed from their own servers, so the URL must be
reachable from the internet over HTTPS: a reverse proxy on a server (see milestone 4), or a
tunnel such as Tailscale Funnel in front of `127.0.0.1:3000`. Then:

- **Google Calendar** (web): _Other calendars_ → **+** → _From URL_. Google refreshes on its
  own schedule (often every few hours) and ignores the requested interval.
- **Apple Calendar**: _File_ → _New Calendar Subscription…_. Set auto-refresh to every hour.
- **Outlook**: _Add calendar_ → _Subscribe from web_.

To try the output without exposing anything, export a file and import it once (a copy that
will not update):

```bash
pnpm events --from startOfWeek --to +P8W --ics > timetable.ics
```

**Security.** The URL is the password: calendar apps cannot send an `Authorization` header,
so whoever has the link can read your timetable. Keep `CALENDAR_TOKEN` separate from
`API_TOKEN` so you can revoke one without the other. The token is compared in constant
time, a wrong token gets a plain `404` without contacting Aurion, and it is redacted from the
logs (`/cal/[REDACTED]`). To revoke a leaked link, change `CALENDAR_TOKEN` and subscribe
again.

When Aurion is unreachable the feed answers `503` rather than an empty calendar, so apps
keep showing the last copy they fetched.

## Architecture

```text
src/
├── domain/            Pure model, no I/O: CourseEvent, DateRange, DateExpression,
│                      Credentials, typed errors
├── ports/             ScheduleProvider, CalendarExporter and Clock interfaces
├── application/       ScheduleService: use cases (between, today, week(s), current, next)
├── http/              Fastify app, zod schemas → OpenAPI, problem+json errors, bearer auth,
│                      iCal feed route, log redaction
├── infrastructure/
│   ├── cache/         CachedScheduleProvider: TTL cache + single-flight (decorator)
│   ├── ical/          ICalExporter: RFC 5545 writer (escaping, 75-octet line folding)
│   └── aurion/        How we get it from Aurion
│       ├── AurionHttpClient     fetch wrapper: cookies, no auto-redirects, timeouts
│       ├── JsfForm              serialises a <form> the way a browser does
│       ├── AurionSession        login (step 1-4)
│       ├── MainMenuPage         sidebar navigation (step 5)
│       ├── PlanningPage         schedule AJAX calls (step 6-7)
│       ├── PartialResponse      JSF <partial-response> XML parser
│       ├── AurionEventMapper    raw JSON → CourseEvent
│       └── AurionScheduleProvider   implements ScheduleProvider: session reuse,
│                                    re-login on expiry, serialisation
├── config/            Env validation with zod
├── main.ts            Composition root: builds the object graph by hand and starts the server
└── cli.ts
```

A request flows `http → ScheduleService → CachedScheduleProvider → AurionScheduleProvider`.
Each arrow is an interface, so every layer is tested on its own with a fake of the next one.

Design choices:

- **Ports and adapters.** Higher layers depend on `ScheduleProvider`, not on Aurion, so
  another school system can be plugged in without touching them.
- **Decorator for caching.** `CachedScheduleProvider` wraps any provider. It answers a
  range from any fresh entry that contains it, widens misses to whole days (so `from=now`
  hits the cache) and stores the pending promise, so concurrent requests share one Aurion
  round-trip. Failures are not cached.
- **Injected clock.** "now" comes from a `Clock`, so relative dates, `current` and `next`
  are tested at fixed instants, including across a daylight-saving change.
- **Exporters behind a port.** The feed route only knows `CalendarExporter`. The iCalendar
  writer is hand-written (about 100 lines) rather than a dependency: the subset needed is
  small, and owning escaping and line folding keeps them unit-tested. Its output is checked
  against Mozilla's `ical.js` parser.
- **No hard-coded JSF ids.** `JsfForm` reads every field from the page like a browser
  would. Tests check that it rebuilds the **exact request bodies recorded from a real browser**.
- **Typed failures.** `InvalidCredentialsError`, `SessionExpiredError`,
  `AurionUnavailableError`, `AurionLayoutChangedError`, `RangeTooLargeError` map to HTTP
  statuses in one place (`http/problem.ts`); unexpected errors never leak their message.
- **Secrets stay secret.** `Credentials` redacts the password from `JSON.stringify`,
  `console.log` and string conversion. Tokens are compared in constant time and the
  calendar token is redacted from request logs. HAR files are git-ignored.

The reverse-engineered protocol is documented in [docs/aurion-protocol.md](docs/aurion-protocol.md).

## Development

```bash
pnpm test              # unit + integration tests (no network)
pnpm test:coverage
pnpm check             # typecheck + lint + format + tests (what CI runs)
```

The HTTP layer is tested with Fastify's `inject()` (no open port), against the recorded
school year. One integration test wires the whole stack, as `main.ts` does, on top of
`FakeAurion`.

Tests run against a `FakeAurion` that replays anonymised responses recorded from a real
session. To refresh them after an Aurion update:

1. In your browser's dev tools (Network tab, "Preserve log" on), log in to Aurion and open **My Schedule**.
2. Export as HAR (`aurion.har`). **It contains your password in clear text.**
3. `pnpm fixtures:from-har aurion.har --redact "Your Name"`
4. Delete the HAR.

The script accepts several HARs, including partial ones (only the session expiring, only a
one-year request…), and only rewrites the fixtures it finds. It replaces teacher names with
pseudonyms and refuses to write a fixture that contains your login.

## Roadmap

- [x] **0 — Spike:** protocol captured, anonymised fixtures
- [x] **1 — Scraper core:** typed client, tests against recorded responses, CLI
- [x] **2 — REST API:** `GET /v1/events?from=…&to=…`, relative dates (`now`, `+P7D`), `/current`, `/next`, cache, OpenAPI docs
- [x] **3 — iCal feed:** `GET /cal/<token>.ics`, subscribe from Google/Apple/Outlook calendar
- [ ] **4 — Ship:** Dockerfile, docker-compose, deployment guide
- [ ] Ideas: change notifications (webhooks), grades

## Disclaimer

Unofficial project, not affiliated with JUNIA or Auriga. It only accesses your own data with
your own credentials.
