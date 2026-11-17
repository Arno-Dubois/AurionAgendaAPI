import { DateTime } from "luxon";
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULTS } from "../../src/config/AurionConfig.js";
import { Credentials } from "../../src/domain/Credentials.js";
import { DateRange } from "../../src/domain/DateRange.js";
import {
  AurionLayoutChangedError,
  AurionUnavailableError,
  InvalidCredentialsError,
  RangeTooLargeError,
} from "../../src/domain/errors.js";
import { AurionScheduleProvider } from "../../src/infrastructure/aurion/AurionScheduleProvider.js";
import { BASE_URL, FakeAurion, VALID_PASSWORD, VALID_USERNAME } from "../support/FakeAurion.js";
import { fixture } from "../support/fixtures.js";

const zone = "Europe/Paris";
const day = (iso: string) => DateTime.fromISO(iso, { zone });
const recordedWeek = DateRange.days(day("2026-11-16"), day("2026-11-20"));

function createProvider(
  aurion: FakeAurion,
  overrides: Partial<{ password: string; menu: string }> = {},
) {
  return new AurionScheduleProvider(
    {
      ...DEFAULTS,
      baseUrl: BASE_URL,
      credentials: new Credentials(VALID_USERNAME, overrides.password ?? VALID_PASSWORD),
      planningMenuItemClass: overrides.menu ?? DEFAULTS.planningMenuItemClass,
    },
    { fetch: aurion.fetch },
  );
}

describe("AurionScheduleProvider (against a fake Aurion built from the HAR)", () => {
  let aurion: FakeAurion;
  let provider: AurionScheduleProvider;

  beforeEach(() => {
    aurion = new FakeAurion();
    provider = createProvider(aurion);
  });

  it("logs in, opens the planning and returns the week's events in order", async () => {
    const events = await provider.getEvents(recordedWeek);

    expect(events).toHaveLength(10);
    const starts = events.map((e) => e.start.toMillis());
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(aurion.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      "GET /",
      "GET /faces/Login.xhtml",
      "POST /login",
      "GET /",
      "POST /faces/MainMenuPage.xhtml",
      "GET /faces/Planning.xhtml",
      "POST /faces/Planning.xhtml",
    ]);
  });

  it("sends credentials URL-encoded, and only to the login endpoint", async () => {
    await provider.getEvents(recordedWeek);

    const login = aurion.requests.find((r) => r.path === "/login");
    expect(login?.form.get("password")).toBe(VALID_PASSWORD); // contains & = + %
    expect(login?.form.has("j_idt43")).toBe(true);
    for (const request of aurion.requests.filter((r) => r !== login)) {
      expect(request.form.toString()).not.toContain(encodeURIComponent(VALID_PASSWORD));
    }
  });

  it("uses the rotated session cookie after login", async () => {
    await provider.getEvents(recordedWeek);
    const cookies = aurion.requests.map((r) => r.headers.get("cookie"));
    expect(cookies[0]).toBeNull();
    expect(cookies.at(-1)).toMatch(/^JSESSIONID=FAKE\d+$/);
    expect(cookies.at(-1)).not.toBe(cookies[2]); // different from the pre-login session
  });

  it("asks Aurion for padded whole UTC days, as epoch milliseconds", async () => {
    await provider.getEvents(recordedWeek);
    const [call] = aurion.planningAjaxCalls;
    expect(Number(call?.form.get("form:j_idt118_start"))).toBe(Date.UTC(2026, 10, 14));
    expect(Number(call?.form.get("form:j_idt118_end"))).toBe(Date.UTC(2026, 10, 22));
    expect(call?.headers.get("faces-request")).toBe("partial/ajax");
  });

  it("filters events to the requested range", async () => {
    const tuesday = await provider.getEvents(DateRange.days(day("2026-11-17"), day("2026-11-17")));
    expect(tuesday.map((e) => e.start.toFormat("HH:mm"))).toEqual(["09:00", "13:30"]);

    const thursdayAfternoon = DateRange.of(day("2026-11-19T16:00"), day("2026-11-19T18:00"));
    const ongoing = await provider.getEvents(thursdayAfternoon);
    expect(ongoing).toHaveLength(1);
    expect(ongoing[0]?.kind).toBe("ASSOCIATIF");
  });

  it("reuses the session for later calls", async () => {
    await provider.getEvents(recordedWeek);
    await provider.getEvents(recordedWeek);
    expect(aurion.logins).toBe(1);
    expect(aurion.planningAjaxCalls).toHaveLength(2);
  });

  it("logs in again once when the session expired (recorded ViewExpiredException)", async () => {
    await provider.getEvents(recordedWeek);
    aurion.expireAllSessions();

    const events = await provider.getEvents(recordedWeek);
    expect(events).toHaveLength(10);
    expect(aurion.logins).toBe(2);
    expect(aurion.planningAjaxCalls).toHaveLength(3); // ok, expired, ok after re-login
  });

  it("fetches a whole school year in a single request, as the browser does", async () => {
    aurion.planningEventsXml = fixture("planning-year.xml");
    const schoolYear = DateRange.fromISO("2026-09-01", "2027-07-01", zone);
    const events = await provider.getEvents(schoolYear);

    expect(aurion.planningAjaxCalls).toHaveLength(1);
    expect(events).toHaveLength(292);
    expect(events.filter((e) => e.isExam)).toHaveLength(18);
    expect(events[0]?.start.toISO()).toBe("2026-09-07T10:00:00.000+02:00");
  });

  it("refuses ranges longer than the configured maximum without calling Aurion", async () => {
    const tooLong = DateRange.fromISO("2026-01-01", "2027-02-01", zone);
    await expect(provider.getEvents(tooLong)).rejects.toThrow(RangeTooLargeError);
    expect(aurion.requests).toHaveLength(0);
  });

  it("accepts exactly one year", async () => {
    const year = DateRange.fromISO("2026-09-01", "2027-09-01", zone);
    await expect(provider.getEvents(year)).resolves.toBeDefined();
  });

  it("reports wrong credentials", async () => {
    const wrong = createProvider(aurion, { password: "nope" });
    await expect(wrong.getEvents(recordedWeek)).rejects.toThrow(InvalidCredentialsError);
  });

  it("reports network failures and server errors as unavailability", async () => {
    aurion.failNextWith = "network";
    await expect(provider.getEvents(recordedWeek)).rejects.toThrow(AurionUnavailableError);

    aurion.failNextWith = "http-503";
    await expect(provider.getEvents(recordedWeek)).rejects.toThrow(/HTTP 503/);

    // and recovers afterwards
    await expect(provider.getEvents(recordedWeek)).resolves.toHaveLength(10);
  });

  it("reports a missing sidebar entry with the available ones", async () => {
    const misconfigured = createProvider(aurion, { menu: "item_000" });
    await expect(misconfigured.getEvents(recordedWeek)).rejects.toThrow(AurionLayoutChangedError);
  });

  it("reports a malformed schedule payload", async () => {
    aurion.planningEventsXml = `<?xml version='1.0'?><partial-response><changes><update id="form:j_idt118"><![CDATA[{"events" : [{"id": "x"}]}]]></update></changes></partial-response>`;
    await expect(provider.getEvents(recordedWeek)).rejects.toThrow(/malformed event/);
  });

  it("serialises concurrent calls on a single session", async () => {
    const results = await Promise.all([
      provider.getEvents(recordedWeek),
      provider.getEvents(recordedWeek),
      provider.getEvents(recordedWeek),
    ]);
    expect(results.map((r) => r.length)).toEqual([10, 10, 10]);
    expect(aurion.logins).toBe(1);
  });
});
