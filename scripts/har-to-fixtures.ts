/**
 * Turns browser HAR captures of Aurion into anonymised test fixtures.
 *
 *   pnpm fixtures:from-har path/to/aurion.har [more.har…] [--redact "Firstname Lastname"]…
 *
 * Every HAR is scanned for the responses below; whatever is found is written, so a HAR of
 * a single action (e.g. a session expiring) only refreshes the matching fixture.
 *
 * - Only response bodies and non-secret request fields are written.
 * - Teacher names in planning events are replaced by stable pseudonyms.
 * - `--redact` strings (your name, student number…) are replaced everywhere.
 * - The script aborts if a login username or password would end up in a fixture.
 *
 * A HAR contains your password and session cookie in clear text: never commit it
 * (`*.har` is git-ignored) and delete it once the fixtures are generated.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

interface HarEntry {
  request: { method: string; url: string; postData?: { text?: string } };
  response: { status: number; content: { text?: string; encoding?: string } };
}

const OUTPUT_DIR = "test/fixtures/aurion";
/** Planning requests longer than this are saved as the "whole year" fixture. */
const LONG_RANGE_DAYS = 60;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { redact: { type: "string", multiple: true, default: [] } },
});
if (positionals.length === 0) {
  console.error('Usage: pnpm fixtures:from-har <file.har>… [--redact "Your Name"]');
  process.exit(1);
}

const entries = positionals.flatMap(
  (file) =>
    (JSON.parse(readFileSync(file, "utf8")) as { log: { entries: HarEntry[] } }).log.entries,
);

const path = (entry: HarEntry) => new URL(entry.request.url).pathname;
const body = (entry: HarEntry) => {
  const { text = "", encoding } = entry.response.content;
  return encoding === "base64" ? Buffer.from(text, "base64").toString("utf8") : text;
};
const form = (entry: HarEntry) => new URLSearchParams(entry.request.postData?.text ?? "");
const is = (entry: HarEntry, method: string, pathname: string, status?: number) =>
  entry.request.method === method &&
  path(entry) === pathname &&
  (status === undefined || entry.response.status === status);

const loginPosts = entries.filter((e) => is(e, "POST", "/login"));
const secrets = new Set<string>();
for (const post of loginPosts) {
  for (const key of ["username", "password"]) {
    const value = form(post).get(key);
    if (value !== null && value.length >= 3) secrets.add(value);
  }
}

/** Days requested by a planning AJAX call, from its `<widget>_start` / `<widget>_end` fields. */
function requestedDays(entry: HarEntry): number {
  const fields = [...form(entry)];
  const start = Number(fields.find(([key]) => key.endsWith("_start"))?.[1]);
  const end = Number(fields.find(([key]) => key.endsWith("_end"))?.[1]);
  return (end - start) / 86_400_000;
}

const planningEvents = entries.filter(
  (e) => is(e, "POST", "/faces/Planning.xhtml", 200) && body(e).includes('"events"'),
);
const menuPost = entries.find((e) => is(e, "POST", "/faces/MainMenuPage.xhtml"));
const weekAjax = planningEvents.findLast((e) => requestedDays(e) <= LONG_RANGE_DAYS);

const found: Record<string, HarEntry | undefined> = {
  "login-page.html": entries.find((e) => is(e, "GET", "/faces/Login.xhtml", 200)),
  "login-failed.html": loginPosts.find((e) => e.response.status === 200),
  "home-page.html": entries.find((e) => is(e, "GET", "/", 200)),
  "planning-page.html": entries.find((e) => is(e, "GET", "/faces/Planning.xhtml", 200)),
  "planning-events.xml": weekAjax,
  "planning-year.xml": planningEvents.findLast((e) => requestedDays(e) > LONG_RANGE_DAYS),
  "session-expired.xml": entries.find(
    (e) => is(e, "POST", "/faces/Planning.xhtml", 200) && body(e).includes("ViewExpiredException"),
  ),
  "session-expired.html": entries.find(
    (e) => e.response.status === 500 && /session a expir/i.test(body(e)),
  ),
};

const pseudonyms = new Map<string, string>();
function pseudonym(teacher: string): string {
  const title = /^(Mr|Mme|Ms|Mrs|M\.|Madame|Monsieur)\b/i.exec(teacher)?.[1] ?? "Mx";
  let alias = pseudonyms.get(teacher);
  if (alias === undefined) {
    alias = `${title} TEACHER_${String.fromCharCode(65 + pseudonyms.size)}`;
    pseudonyms.set(teacher, alias);
  }
  return alias;
}

/** Replaces the teacher (last line) of every event title. */
function anonymiseEvents(xml: string): string {
  return xml.replace(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/g, (_match, encoded: string) => {
    const lines = (JSON.parse(`"${encoded}"`) as string).split("\n");
    const last = lines.length - 1;
    if (lines.length >= 5 && lines[last]?.trim()) lines[last] = pseudonym(lines[last].trim());
    return `"title": ${JSON.stringify(lines.join("\n"))}`;
  });
}

function redact(text: string): string {
  return values.redact.reduce((result, value) => result.replaceAll(value, "Jane DOE"), text);
}

const fixtures: Record<string, string> = {};
for (const [name, entry] of Object.entries(found)) {
  if (entry === undefined) continue;
  fixtures[name] =
    name.startsWith("planning-") && name.endsWith(".xml")
      ? anonymiseEvents(body(entry))
      : body(entry);
}
if (menuPost !== undefined && weekAjax !== undefined) {
  fixtures["requests.json"] = `${JSON.stringify(
    {
      note: "Request bodies sent by the browser (login values removed).",
      loginFieldNames: [...form(loginPosts.at(-1) ?? menuPost).keys()],
      menuPost: [...form(menuPost)],
      planningAjax: [...form(weekAjax)],
    },
    null,
    2,
  )}\n`;
}

mkdirSync(OUTPUT_DIR, { recursive: true });
for (const [name, raw] of Object.entries(fixtures)) {
  const content = redact(raw);
  for (const secret of secrets) {
    if (content.includes(secret)) {
      throw new Error(`Refusing to write ${name}: it contains a login value from the HAR.`);
    }
  }
  writeFileSync(join(OUTPUT_DIR, name), content);
  console.log(`wrote ${join(OUTPUT_DIR, name)} (${content.length} chars)`);
}
const missing = Object.keys(found).filter((name) => !(name in fixtures));
if (missing.length > 0) console.log(`not in these HARs (kept as is): ${missing.join(", ")}`);
console.log(`${pseudonyms.size} teacher names replaced by pseudonyms.`);
