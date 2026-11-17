import * as cheerio from "cheerio";
import { AurionLayoutChangedError, SessionExpiredError } from "../../domain/errors.js";
import type { DateRange } from "../../domain/DateRange.js";
import type { AurionHttpClient } from "./AurionHttpClient.js";
import { isLoginUrl } from "./AurionHttpClient.js";
import { JsfForm } from "./JsfForm.js";
import { PartialResponse } from "./PartialResponse.js";

const STEP = "fetching planning events";

/**
 * The "My Schedule" page. It hosts a PrimeFaces `<p:schedule>` widget that loads events
 * lazily with an AJAX call carrying `<scheduleId>_start` / `<scheduleId>_end` in epoch ms.
 *
 * The page is stateful: each AJAX answer carries the next `javax.faces.ViewState`.
 */
export class PlanningPage {
  #viewState: string | undefined;

  private constructor(
    private readonly form: JsfForm,
    readonly scheduleId: string,
  ) {
    this.#viewState = form.viewState;
  }

  static fromHtml(html: string): PlanningPage {
    const step = "reading the planning page";
    const $ = cheerio.load(html);
    const scheduleId = $("div.schedule[id]").first().attr("id");
    if (scheduleId === undefined) {
      throw new AurionLayoutChangedError(step, "no schedule widget (div.schedule) on the page");
    }
    const form = JsfForm.fromHtml(html, "form:has(div.schedule)", step);
    return new PlanningPage(form, scheduleId);
  }

  /**
   * Returns the raw content of the schedule update (`{"events" : [...]}`) for `range`.
   * The range is sent as-is; callers decide how to align it.
   */
  async fetchScheduleJson(http: AurionHttpClient, range: DateRange): Promise<string> {
    const id = this.scheduleId;
    const timezoneOffsetField = `${this.form.id}:offsetFuseauNavigateur`;
    const body = this.form.toBody({
      "javax.faces.partial.ajax": "true",
      "javax.faces.source": id,
      "javax.faces.partial.execute": id,
      "javax.faces.partial.render": id,
      [id]: id,
      [`${id}_start`]: String(range.from.toMillis()),
      [`${id}_end`]: String(range.to.toMillis()),
      // Filled in by Aurion's JavaScript in the browser; the HAR shows "0".
      ...(this.form.has(timezoneOffsetField) ? { [timezoneOffsetField]: "0" } : {}),
      ...(this.#viewState === undefined ? {} : { "javax.faces.ViewState": this.#viewState }),
    });

    const response = await http.postPartial(this.form.action, body);
    if (isLoginUrl(response.location)) throw new SessionExpiredError();
    if (response.status !== 200) {
      throw new AurionLayoutChangedError(STEP, `unexpected HTTP ${response.status}`);
    }

    const partial = PartialResponse.parse(response.body, STEP);
    if (partial.viewState !== undefined) this.#viewState = partial.viewState;
    const json = partial.update(id);
    if (json === undefined) {
      throw new AurionLayoutChangedError(STEP, `the response has no update for "${id}"`);
    }
    return json;
  }
}
