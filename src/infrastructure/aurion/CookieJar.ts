/**
 * Minimal cookie store for a single host.
 *
 * Aurion only uses one cookie (`JSESSIONID`, rotated after login), so attributes such as
 * Path, Domain and Expires are deliberately ignored.
 */
export class CookieJar {
  readonly #cookies = new Map<string, string>();

  /** Stores the cookies from a response's `Set-Cookie` headers. */
  storeFrom(headers: Headers): void {
    for (const header of headers.getSetCookie()) {
      const pair = header.split(";", 1)[0] ?? "";
      const separator = pair.indexOf("=");
      if (separator <= 0) continue;
      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      if (value === "" || /max-age=0\b/i.test(header)) this.#cookies.delete(name);
      else this.#cookies.set(name, value);
    }
  }

  get(name: string): string | undefined {
    return this.#cookies.get(name);
  }

  /** Value for a request's `Cookie` header, or `undefined` if the jar is empty. */
  toHeader(): string | undefined {
    if (this.#cookies.size === 0) return undefined;
    return [...this.#cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  clear(): void {
    this.#cookies.clear();
  }
}
