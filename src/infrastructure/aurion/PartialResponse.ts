import * as cheerio from "cheerio";
import { AurionLayoutChangedError, SessionExpiredError } from "../../domain/errors.js";
import { isLoginUrl } from "./AurionHttpClient.js";

const VIEW_STATE_UPDATE = "javax.faces.ViewState";

/**
 * Parsed JSF `<partial-response>`, the XML document PrimeFaces AJAX calls return:
 *
 * ```xml
 * <partial-response>
 *   <changes>
 *     <update id="form:j_idt118"><![CDATA[{"events" : [...]}]]></update>
 *     <update id="j_id1:javax.faces.ViewState:0"><![CDATA[911…:729…]]></update>
 *   </changes>
 * </partial-response>
 * ```
 *
 * It can also be `<redirect url="…"/>` (e.g. session expired) or `<error>…</error>`.
 */
export class PartialResponse {
  private constructor(
    private readonly updates: ReadonlyMap<string, string>,
    readonly viewState: string | undefined,
  ) {}

  static parse(xml: string, step: string): PartialResponse {
    // XML mode keeps CDATA sections intact (HTML mode turns them into comments).
    const $ = cheerio.load(xml, { xml: true });
    const root = $("partial-response");
    if (root.length === 0) {
      throw new AurionLayoutChangedError(step, "the response is not a JSF partial-response");
    }

    const redirect = root.find("redirect").attr("url");
    if (redirect !== undefined) {
      if (isLoginUrl(new URL(redirect, "https://placeholder.invalid"))) {
        throw new SessionExpiredError();
      }
      throw new AurionLayoutChangedError(step, `unexpected redirect to ${redirect}`);
    }

    const error = root.find("error");
    if (error.length > 0) {
      const name = error.find("error-name").text().trim();
      const message = error.find("error-message").text().trim();
      if (/ViewExpired/i.test(name)) throw new SessionExpiredError();
      throw new AurionLayoutChangedError(step, `server error ${name}: ${message}`);
    }

    const updates = new Map<string, string>();
    let viewState: string | undefined;
    root.find("changes > update").each((_, element) => {
      const id = $(element).attr("id") ?? "";
      const content = $(element).text();
      if (id.includes(VIEW_STATE_UPDATE)) viewState = content.trim();
      else updates.set(id, content);
    });
    return new PartialResponse(updates, viewState);
  }

  update(id: string): string | undefined {
    return this.updates.get(id);
  }
}
