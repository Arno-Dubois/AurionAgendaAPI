import { inspect } from "node:util";

/**
 * Aurion login. The password is kept in a private field and redacted from
 * `JSON.stringify`, `console.log` and string interpolation, so it cannot leak into logs by accident.
 */
export class Credentials {
  readonly #password: string;

  constructor(
    readonly username: string,
    password: string,
  ) {
    if (username.trim() === "") throw new TypeError("Username must not be empty.");
    if (password === "") throw new TypeError("Password must not be empty.");
    this.#password = password;
  }

  /** Only call this when building the login request. */
  revealPassword(): string {
    return this.#password;
  }

  toJSON() {
    return { username: this.username, password: "[REDACTED]" };
  }

  toString(): string {
    return `Credentials(${this.username}, [REDACTED])`;
  }

  [inspect.custom](): string {
    return this.toString();
  }
}
