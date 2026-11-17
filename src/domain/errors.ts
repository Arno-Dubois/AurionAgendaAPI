/**
 * Every error the library throws on purpose extends {@link AurionAgendaError},
 * so callers (the future HTTP layer, the CLI) can map them to a status code or message
 * without string-matching.
 */
export abstract class AurionAgendaError extends Error {
  abstract readonly code: string;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** The caller asked for something invalid (bad dates, range too long…). */
export class InvalidRangeError extends AurionAgendaError {
  readonly code: string = "INVALID_RANGE";
}

export class RangeTooLargeError extends InvalidRangeError {
  override readonly code = "RANGE_TOO_LARGE";

  constructor(
    readonly requestedDays: number,
    readonly maxDays: number,
  ) {
    super(`Requested range is ${requestedDays} days long, the maximum is ${maxDays} days.`);
  }
}

/** A `from` / `to` value could not be understood ("tomorow", "+7D"…). */
export class InvalidDateExpressionError extends AurionAgendaError {
  readonly code = "INVALID_DATE_EXPRESSION";

  constructor(
    readonly expression: string,
    detail: string,
  ) {
    super(`Invalid date expression "${expression}": ${detail}`);
  }
}

/** Aurion rejected the username/password. Retrying will not help. */
export class InvalidCredentialsError extends AurionAgendaError {
  readonly code = "INVALID_CREDENTIALS";

  constructor() {
    super("Aurion rejected the username or password.");
  }
}

/** The Aurion session cookie is no longer valid; logging in again should fix it. */
export class SessionExpiredError extends AurionAgendaError {
  readonly code = "SESSION_EXPIRED";

  constructor() {
    super("The Aurion session has expired.");
  }
}

/** Aurion could not be reached, timed out, or answered with a server error. */
export class AurionUnavailableError extends AurionAgendaError {
  readonly code = "AURION_UNAVAILABLE";
}

/**
 * Aurion answered, but not with what the scraper expected: a page changed, an element
 * is missing, the JSON is malformed… This usually means the scraper needs updating.
 */
export class AurionLayoutChangedError extends AurionAgendaError {
  readonly code = "AURION_LAYOUT_CHANGED";

  constructor(
    readonly step: string,
    detail: string,
    options?: ErrorOptions,
  ) {
    super(`Unexpected Aurion response while ${step}: ${detail}`, options);
  }
}
