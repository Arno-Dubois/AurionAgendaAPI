import type { AurionConfig } from "../../config/AurionConfig.js";
import type { CourseEvent } from "../../domain/CourseEvent.js";
import type { DateRange } from "../../domain/DateRange.js";
import { RangeTooLargeError, SessionExpiredError } from "../../domain/errors.js";
import type { ScheduleProvider } from "../../ports/ScheduleProvider.js";
import { SerialQueue } from "../../shared/SerialQueue.js";
import { AurionEventMapper } from "./AurionEventMapper.js";
import { AurionHttpClient, type FetchFn } from "./AurionHttpClient.js";
import { AurionSession } from "./AurionSession.js";
import type { PlanningPage } from "./PlanningPage.js";

type ProviderConfig = Pick<
  AurionConfig,
  | "baseUrl"
  | "credentials"
  | "timezone"
  | "planningMenuItemClass"
  | "maxRangeDays"
  | "requestTimeoutMs"
>;

interface OpenPlanning {
  http: AurionHttpClient;
  page: PlanningPage;
}

/**
 * {@link ScheduleProvider} backed by the Aurion web interface.
 *
 * - Logs in lazily on the first call and reuses the session afterwards.
 * - Logs in again (once) when Aurion reports the session as expired.
 * - Fetches the whole range in one request: Aurion answers a full school year (~300 events,
 *   ~70 kB) in a single response, so there is no need to split it.
 * - Serialises calls, because a JSF session cannot handle concurrent requests safely.
 */
export class AurionScheduleProvider implements ScheduleProvider {
  readonly #config: ProviderConfig;
  readonly #fetch: FetchFn | undefined;
  readonly #mapper: AurionEventMapper;
  readonly #queue = new SerialQueue();
  #planning: OpenPlanning | undefined;

  constructor(config: ProviderConfig, options: { fetch?: FetchFn } = {}) {
    this.#config = config;
    this.#fetch = options.fetch;
    this.#mapper = new AurionEventMapper(config.timezone);
  }

  async getEvents(range: DateRange): Promise<CourseEvent[]> {
    const days = Math.ceil(range.durationInDays);
    if (days > this.#config.maxRangeDays) {
      throw new RangeTooLargeError(days, this.#config.maxRangeDays);
    }

    // Aurion's calendar asks for whole UTC days and filters on its side with its own timezone
    // rules. Asking for one extra day on each side and filtering here avoids edge cases.
    const request = range.pad(1).toWholeUtcDays();

    const json = await this.#queue.run(() =>
      this.#withPlanning(({ http, page }) => page.fetchScheduleJson(http, request)),
    );

    return this.#mapper
      .parseScheduleUpdate(json)
      .filter((event) => range.overlaps(event))
      .sort(
        (a, b) => a.start.toMillis() - b.start.toMillis() || a.end.toMillis() - b.end.toMillis(),
      );
  }

  /** Forgets the current session; the next call logs in again. */
  reset(): void {
    this.#planning = undefined;
  }

  async #withPlanning<T>(task: (planning: OpenPlanning) => Promise<T>): Promise<T> {
    const reused = this.#planning !== undefined;
    try {
      return await this.#runOnPlanning(task);
    } catch (error) {
      // A reused session may have expired server-side: log in again, once.
      if (!(error instanceof SessionExpiredError) || !reused) throw error;
      return this.#runOnPlanning(task);
    }
  }

  async #runOnPlanning<T>(task: (planning: OpenPlanning) => Promise<T>): Promise<T> {
    this.#planning ??= await this.#openPlanning();
    try {
      return await task(this.#planning);
    } catch (error) {
      // Whatever went wrong, the page's ViewState may now be stale: start fresh next time.
      this.#planning = undefined;
      throw error;
    }
  }

  async #openPlanning(): Promise<OpenPlanning> {
    const http = new AurionHttpClient(this.#config.baseUrl, {
      timeoutMs: this.#config.requestTimeoutMs,
      ...(this.#fetch === undefined ? {} : { fetch: this.#fetch }),
    });
    const session = await AurionSession.login(http, this.#config.credentials);
    const page = await session.openPlanning(this.#config.planningMenuItemClass);
    return { http, page };
  }
}
