import {
  AurionLayoutChangedError,
  AurionUnavailableError,
  SessionExpiredError,
} from "../../domain/errors.js";
import { CookieJar } from "./CookieJar.js";

export type FetchFn = (input: URL, init: RequestInit) => Promise<Response>;

export interface AurionHttpClientOptions {
  /** Injected so tests can replace the network with recorded responses. */
  fetch?: FetchFn;
  timeoutMs?: number;
  userAgent?: string;
}

export interface AurionResponse {
  status: number;
  url: URL;
  /** Absolute target of a 3xx response. */
  location: URL | undefined;
  body: string;
}

const MAX_REDIRECTS = 5;
const LOGIN_PAGE_PATTERN = /\/(?:faces\/)?Login\.xhtml|\/login(?:$|[?#])/i;
/**
 * A full-page POST on an expired session answers HTTP 500 with "Votre session a expiré".
 * The page is windows-1252, so match only the ASCII part.
 */
const SESSION_EXPIRED_PAGE = /session a expir|session (?:has )?expired/i;

export function isLoginUrl(url: URL | undefined): boolean {
  return url !== undefined && LOGIN_PAGE_PATTERN.test(url.pathname + url.search);
}

/**
 * Thin wrapper over `fetch` that behaves like the browser session Aurion expects:
 * it keeps the session cookie, sends Origin/Referer, and does **not** follow redirects
 * automatically, because the redirect target is how we tell success from failure.
 */
export class AurionHttpClient {
  readonly cookies = new CookieJar();
  readonly #baseUrl: URL;
  readonly #fetch: FetchFn;
  readonly #timeoutMs: number;
  readonly #userAgent: string;
  #referer: URL | undefined;

  constructor(baseUrl: URL, options: AurionHttpClientOptions = {}) {
    this.#baseUrl = baseUrl;
    this.#fetch = options.fetch ?? ((input, init) => fetch(input, init));
    this.#timeoutMs = options.timeoutMs ?? 30_000;
    this.#userAgent =
      options.userAgent ?? "AurionAgendaAPI/0.1 (+https://github.com/Arno-Dubois/AurionAgendaAPI)";
  }

  get baseUrl(): URL {
    return this.#baseUrl;
  }

  resolve(path: string | URL): URL {
    return new URL(path, this.#baseUrl);
  }

  async get(path: string | URL): Promise<AurionResponse> {
    return this.#send(this.resolve(path), { method: "GET" }, "text/html,application/xhtml+xml");
  }

  /** Classic form submission (`application/x-www-form-urlencoded`). */
  async postForm(path: string | URL, form: URLSearchParams): Promise<AurionResponse> {
    return this.#send(
      this.resolve(path),
      {
        method: "POST",
        body: form.toString(),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      },
      "text/html,application/xhtml+xml",
    );
  }

  /** PrimeFaces/JSF partial AJAX request; the answer is a `<partial-response>` XML document. */
  async postPartial(path: string | URL, form: URLSearchParams): Promise<AurionResponse> {
    return this.#send(
      this.resolve(path),
      {
        method: "POST",
        body: form.toString(),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "Faces-Request": "partial/ajax",
          "X-Requested-With": "XMLHttpRequest",
        },
      },
      "application/xml, text/xml, */*; q=0.01",
      { updateReferer: false },
    );
  }

  /** GETs the `Location` of a redirect response. */
  async follow(response: AurionResponse): Promise<AurionResponse> {
    if (response.location === undefined) {
      throw new TypeError(`Response from ${response.url.href} is not a redirect.`);
    }
    return this.get(response.location);
  }

  /**
   * Follows redirects until a 200 page.
   * With `allowLogin: false`, landing on the login page means the session is gone.
   */
  async followRedirects(
    response: AurionResponse,
    { allowLogin = true } = {},
  ): Promise<AurionResponse> {
    let current = response;
    for (let hop = 0; current.location !== undefined; hop++) {
      if (hop >= MAX_REDIRECTS) {
        throw new AurionLayoutChangedError("following redirects", "too many redirects");
      }
      if (!allowLogin && isLoginUrl(current.location)) throw new SessionExpiredError();
      current = await this.follow(current);
    }
    if (current.status !== 200) {
      throw new AurionLayoutChangedError(
        `loading ${current.url.pathname}`,
        `unexpected HTTP ${current.status}`,
      );
    }
    return current;
  }

  async #send(
    url: URL,
    init: RequestInit,
    accept: string,
    { updateReferer = true } = {},
  ): Promise<AurionResponse> {
    const headers = new Headers(init.headers);
    headers.set("Accept", accept);
    headers.set("Accept-Language", "fr-FR,fr;q=0.9,en;q=0.8");
    headers.set("User-Agent", this.#userAgent);
    const cookie = this.cookies.toHeader();
    if (cookie !== undefined) headers.set("Cookie", cookie);
    if (init.method === "POST") headers.set("Origin", this.#baseUrl.origin);
    if (this.#referer !== undefined) headers.set("Referer", this.#referer.href);

    let response: Response;
    let body: string;
    try {
      response = await this.#fetch(url, {
        ...init,
        headers,
        redirect: "manual",
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
      body = await response.text();
    } catch (error) {
      const reason =
        error instanceof Error && error.name === "TimeoutError"
          ? `timed out after ${this.#timeoutMs} ms`
          : "network error";
      throw new AurionUnavailableError(`${init.method ?? "GET"} ${url.pathname}: ${reason}`, {
        cause: error,
      });
    }

    if (response.status >= 500) {
      if (SESSION_EXPIRED_PAGE.test(body)) throw new SessionExpiredError();
      throw new AurionUnavailableError(
        `${init.method ?? "GET"} ${url.pathname} answered HTTP ${response.status}`,
      );
    }

    this.cookies.storeFrom(response.headers);
    const locationHeader = response.headers.get("location");
    const location = locationHeader === null ? undefined : new URL(locationHeader, url);
    if (updateReferer && response.status === 200) this.#referer = url;

    return { status: response.status, url, location, body };
  }
}
