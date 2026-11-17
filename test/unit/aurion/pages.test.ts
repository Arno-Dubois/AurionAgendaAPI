import { describe, expect, it } from "vitest";
import {
  AurionLayoutChangedError,
  AurionUnavailableError,
  SessionExpiredError,
} from "../../../src/domain/errors.js";
import {
  AurionHttpClient,
  isLoginUrl,
} from "../../../src/infrastructure/aurion/AurionHttpClient.js";
import { CookieJar } from "../../../src/infrastructure/aurion/CookieJar.js";
import { MainMenuPage } from "../../../src/infrastructure/aurion/MainMenuPage.js";
import { PlanningPage } from "../../../src/infrastructure/aurion/PlanningPage.js";
import { SerialQueue } from "../../../src/shared/SerialQueue.js";
import { fixture } from "../../support/fixtures.js";

describe("MainMenuPage", () => {
  const page = MainMenuPage.fromHtml(fixture("home-page.html"));

  it("reads the planning menu id from the link itself", () => {
    expect(page.sidebarParamsFor("item_2169484")).toEqual({
      "form:sidebar": "form:sidebar",
      "form:sidebar_menuid": "1",
    });
  });

  it("lists sidebar entries", () => {
    expect(page.listSidebarItems()).toContainEqual({
      cssClass: "item_2169484",
      label: "My Schedule",
    });
  });

  it("explains how to fix a wrong menu class", () => {
    expect(() => page.sidebarParamsFor("item_404")).toThrow(AurionLayoutChangedError);
    expect(() => page.sidebarParamsFor("item_404")).toThrow(/item_2169484 \("My Schedule"\)/);
  });
});

describe("PlanningPage", () => {
  it("finds the schedule widget id", () => {
    expect(PlanningPage.fromHtml(fixture("planning-page.html")).scheduleId).toBe("form:j_idt118");
  });

  it("fails clearly when the widget is gone", () => {
    expect(() => PlanningPage.fromHtml(fixture("home-page.html"))).toThrow(/div\.schedule/);
  });
});

describe("isLoginUrl", () => {
  it.each([
    ["https://aurion.junia.com/faces/Login.xhtml", true],
    ["https://aurion.junia.com/login", true],
    ["https://aurion.junia.com/login?error", true],
    ["https://aurion.junia.com/", false],
    ["https://aurion.junia.com/faces/Planning.xhtml", false],
    ["https://aurion.junia.com/loginHelp.xhtml", false],
  ])("%s → %s", (url, expected) => {
    expect(isLoginUrl(new URL(url))).toBe(expected);
  });
});

describe("AurionHttpClient", () => {
  const clientAnswering = (body: string, status: number) =>
    new AurionHttpClient(new URL("https://aurion.example.test"), {
      fetch: () => Promise.resolve(new Response(body, { status })),
    });

  it("recognises the recorded HTTP 500 'session expired' page", async () => {
    const client = clientAnswering(fixture("session-expired.html"), 500);
    await expect(client.postForm("/faces/Planning.xhtml", new URLSearchParams())).rejects.toThrow(
      SessionExpiredError,
    );
  });

  it("reports other server errors as unavailability", async () => {
    const client = clientAnswering("<h1>Internal Server Error</h1>", 500);
    await expect(client.get("/")).rejects.toThrow(AurionUnavailableError);
  });
});

describe("CookieJar", () => {
  it("stores, replaces and deletes cookies from Set-Cookie headers", () => {
    const jar = new CookieJar();
    expect(jar.toHeader()).toBeUndefined();

    const headers = new Headers();
    headers.append("Set-Cookie", "JSESSIONID=abc; Path=/; Secure; HttpOnly");
    headers.append("Set-Cookie", "lang=fr; Path=/");
    jar.storeFrom(headers);
    expect(jar.toHeader()).toBe("JSESSIONID=abc; lang=fr");

    jar.storeFrom(new Headers({ "Set-Cookie": "JSESSIONID=rotated; Path=/" }));
    expect(jar.get("JSESSIONID")).toBe("rotated");

    jar.storeFrom(new Headers({ "Set-Cookie": "lang=; Max-Age=0" }));
    expect(jar.toHeader()).toBe("JSESSIONID=rotated");
  });
});

describe("SerialQueue", () => {
  it("never runs two tasks at the same time and survives failures", async () => {
    const queue = new SerialQueue();
    const log: string[] = [];
    const task =
      (name: string, fail = false) =>
      async () => {
        log.push(`start ${name}`);
        await new Promise((resolve) => setTimeout(resolve, 5));
        log.push(`end ${name}`);
        if (fail) throw new Error(name);
        return name;
      };

    const results = await Promise.allSettled([
      queue.run(task("a")),
      queue.run(task("b", true)),
      queue.run(task("c")),
    ]);

    expect(log).toEqual(["start a", "end a", "start b", "end b", "start c", "end c"]);
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "rejected", "fulfilled"]);
  });
});
