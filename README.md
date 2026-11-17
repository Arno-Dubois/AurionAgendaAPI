# AurionAgendaAPI

Self-hosted TypeScript service that reads your timetable from **Aurion** (the JUNIA student
portal) and exposes it as clean, typed data, with a JSON API and an iCal feed on the way.

> **Status:** milestone 1 of the [roadmap](#roadmap). The Aurion scraper library and a CLI work; the HTTP API is next.

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
pnpm events               # today + 7 days
pnpm events --from 2026-09-01 --to 2027-06-30 --json > year.json
```

| Variable                             | Default                    |                                                                                                 |
| ------------------------------------ | -------------------------- | ----------------------------------------------------------------------------------------------- |
| `AURION_USERNAME`, `AURION_PASSWORD` | (required)                 | your Aurion login                                                                               |
| `AURION_BASE_URL`                    | `https://aurion.junia.com` |                                                                                                 |
| `AURION_TIMEZONE`                    | `Europe/Paris`             | zone for dates without an offset and for output                                                 |
| `AURION_PLANNING_MENU_ITEM`          | `item_2169484`             | CSS class of the "My Schedule" sidebar link. If it is wrong, the error lists the available ones |
| `AURION_MAX_RANGE_DAYS`              | `366`                      | longest range one call may request                                                              |
| `AURION_REQUEST_TIMEOUT_MS`          | `30000`                    | a whole school year takes about 5 s                                                             |

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

## Architecture

```text
src/
├── domain/            Pure model, no I/O: CourseEvent, DateRange, Credentials, typed errors
├── ports/             ScheduleProvider interface (what the app needs)
├── infrastructure/
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
└── cli.ts
```

Design choices:

- **Ports and adapters.** Higher layers depend on `ScheduleProvider`, not on Aurion, so
  caching or another school system can be plugged in without touching them.
- **No hard-coded JSF ids.** `JsfForm` reads every field from the page like a browser
  would. Tests check that it rebuilds the **exact request bodies recorded from a real browser**.
- **Typed failures.** `InvalidCredentialsError`, `SessionExpiredError`,
  `AurionUnavailableError`, `AurionLayoutChangedError`, `RangeTooLargeError` map cleanly to
  HTTP statuses later.
- **Secrets stay secret.** `Credentials` redacts the password from `JSON.stringify`,
  `console.log` and string conversion. HAR files are git-ignored.

The reverse-engineered protocol is documented in [docs/aurion-protocol.md](docs/aurion-protocol.md).

## Development

```bash
pnpm test              # unit + integration tests (no network)
pnpm test:coverage
pnpm check             # typecheck + lint + format + tests (what CI runs)
```

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
- [ ] **2 — REST API:** `GET /v1/events?from=…&to=…`, relative dates (`now`, `+P7D`), `/current`, `/next`, cache, OpenAPI docs
- [ ] **3 — iCal feed:** subscribe from Google/Apple/Outlook calendar
- [ ] **4 — Ship:** Dockerfile, docker-compose, deployment guide
- [ ] Ideas: change notifications (webhooks), grades

## Disclaimer

Unofficial project, not affiliated with JUNIA or Auriga. It only accesses your own data with
your own credentials.
