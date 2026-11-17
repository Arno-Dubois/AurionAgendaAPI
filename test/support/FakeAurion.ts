import type { FetchFn } from "../../src/infrastructure/aurion/AurionHttpClient.js";
import { fixture } from "./fixtures.js";

export const BASE_URL = new URL("https://aurion.example.test");
export const VALID_USERNAME = "jane.doe@student.junia.com";
export const VALID_PASSWORD = "c0rrect&horse=battery+staple%";

export interface RecordedRequest {
  method: string;
  path: string;
  headers: Headers;
  form: URLSearchParams;
}

/**
 * In-memory imitation of Aurion's behaviour, as observed in HAR captures:
 * cookie-based sessions rotated at login, redirects to the login page when logged out,
 * the recorded expired-session answers, and the recorded HTML/XML responses for each page.
 */
export class FakeAurion {
  readonly requests: RecordedRequest[] = [];
  /** Returned instead of the normal response when set. */
  failNextWith: "network" | "http-503" | undefined;
  /** Replaces the planning AJAX answer when set. */
  planningEventsXml: string | undefined;

  readonly #authenticated = new Set<string>();
  #nextSessionId = 1;

  readonly fetch: FetchFn = async (input, init) => {
    await Promise.resolve(); // behave like a real network call: never answer synchronously
    return this.#handle(input, init);
  };

  get logins(): number {
    return this.requests.filter((r) => r.method === "POST" && r.path === "/login").length;
  }

  get planningAjaxCalls(): RecordedRequest[] {
    return this.requests.filter((r) => r.method === "POST" && r.path === "/faces/Planning.xhtml");
  }

  /** Simulates Aurion dropping every session (timeout, restart…). */
  expireAllSessions(): void {
    this.#authenticated.clear();
  }

  #handle(url: URL, init: RequestInit): Response {
    const method = init.method ?? "GET";
    const headers = new Headers(init.headers);
    const form = new URLSearchParams(typeof init.body === "string" ? init.body : "");
    this.requests.push({ method, path: url.pathname, headers, form });

    if (this.failNextWith !== undefined) {
      const failure = this.failNextWith;
      this.failNextWith = undefined;
      if (failure === "network") throw new TypeError("fetch failed");
      return new Response("Service Unavailable", { status: 503 });
    }

    const session = /JSESSIONID=([^;]+)/.exec(headers.get("cookie") ?? "")?.[1];
    const loggedIn = session !== undefined && this.#authenticated.has(session);
    const route = `${method} ${url.pathname}`;

    switch (route) {
      case "GET /":
        if (!loggedIn) return redirect("/faces/Login.xhtml", session ?? this.#newSession());
        return html(fixture("home-page.html"));

      case "GET /faces/Login.xhtml":
        return html(fixture("login-page.html"));

      case "POST /login": {
        if (form.get("username") === VALID_USERNAME && form.get("password") === VALID_PASSWORD) {
          const rotated = this.#newSession();
          this.#authenticated.add(rotated);
          return redirect(`${BASE_URL.origin}/`, rotated);
        }
        return html(fixture("login-failed.html"));
      }

      case "POST /faces/MainMenuPage.xhtml":
        if (!loggedIn) return sessionExpiredPage();
        if (form.get("form:sidebar_menuid") === "1") return redirect("/faces/Planning.xhtml");
        return html(fixture("home-page.html"));

      case "GET /faces/Planning.xhtml":
        if (!loggedIn) return redirect("/faces/Login.xhtml");
        return html(fixture("planning-page.html"));

      case "POST /faces/Planning.xhtml":
        if (!loggedIn) {
          if (headers.get("faces-request") !== "partial/ajax") return sessionExpiredPage();
          // Recorded: the AJAX answer is a ViewExpiredException plus a new anonymous session.
          return xml(fixture("session-expired.xml"), this.#newSession());
        }
        return xml(this.planningEventsXml ?? fixture("planning-events.xml"));

      default:
        return new Response("Not Found", { status: 404 });
    }
  }

  #newSession(): string {
    return `FAKE${String(this.#nextSessionId++).padStart(4, "0")}`;
  }
}

function redirect(location: string, setSession?: string): Response {
  const headers = new Headers({ Location: location });
  if (setSession !== undefined) {
    headers.append("Set-Cookie", `JSESSIONID=${setSession}; Path=/; Secure; HttpOnly`);
  }
  return new Response(null, { status: 302, headers });
}

function html(body: string): Response {
  return new Response(body, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
}

function xml(body: string, setSession?: string): Response {
  const headers = new Headers({ "Content-Type": "text/xml;charset=UTF-8" });
  if (setSession !== undefined) {
    headers.append("Set-Cookie", `JSESSIONID=${setSession}; Path=/; Secure; HttpOnly`);
  }
  return new Response(body, { headers });
}

/** Recorded answer to a full-page POST on an expired session. */
function sessionExpiredPage(): Response {
  return new Response(fixture("session-expired.html"), {
    status: 500,
    headers: { "Content-Type": "text/html;charset=windows-1252" },
  });
}
