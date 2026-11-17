import * as cheerio from "cheerio";
import type { Credentials } from "../../domain/Credentials.js";
import { AurionLayoutChangedError, InvalidCredentialsError } from "../../domain/errors.js";
import { type AurionHttpClient, isLoginUrl } from "./AurionHttpClient.js";
import { JsfForm } from "./JsfForm.js";
import { MainMenuPage } from "./MainMenuPage.js";

const LOGIN_FORM = "form:has(input[type=password])";

/**
 * A logged-in Aurion session. The only way to get one is {@link AurionSession.login}.
 *
 * Flow (see docs/aurion-protocol.md):
 * 1. `GET /` → 302 to `/faces/Login.xhtml`, which sets `JSESSIONID`
 * 2. `POST /login` with username/password → 302 to `/` on success,
 *    200 + "Login or password invalid" on failure. `JSESSIONID` is rotated.
 * 3. `GET /` → home page (`MainMenuPage`), whose sidebar links to the planning.
 */
export class AurionSession {
  private constructor(
    private readonly http: AurionHttpClient,
    readonly home: MainMenuPage,
  ) {}

  static async login(http: AurionHttpClient, credentials: Credentials): Promise<AurionSession> {
    const loginPage = await http.followRedirects(await http.get("/"));
    const form = JsfForm.fromHtml(loginPage.body, LOGIN_FORM, "reading the login page");

    const overrides: Record<string, string> = {
      username: credentials.username,
      password: credentials.revealPassword(),
    };
    if (form.defaultSubmitter !== undefined) {
      const [name, value] = form.defaultSubmitter;
      overrides[name] = value;
    }
    const response = await http.postForm(form.action || "/login", form.toBody(overrides));

    if (response.status === 200) {
      if (hasLoginError(response.body) || hasLoginForm(response.body)) {
        throw new InvalidCredentialsError();
      }
      throw new AurionLayoutChangedError("logging in", "login answered 200 without an error");
    }
    if (response.location === undefined) {
      throw new AurionLayoutChangedError("logging in", `unexpected HTTP ${response.status}`);
    }
    if (isLoginUrl(response.location)) throw new InvalidCredentialsError();

    const home = await http.followRedirects(response);
    if (isLoginUrl(home.url)) throw new InvalidCredentialsError();
    return new AurionSession(http, MainMenuPage.fromHtml(home.body));
  }

  /** Navigates to "My Schedule" through the sidebar entry with the given CSS class. */
  async openPlanning(menuItemClass: string) {
    return this.home.openPlanning(this.http, menuItemClass);
  }
}

function hasLoginError(html: string): boolean {
  return cheerio.load(html)(".ui-messages-error, .ui-message-error").length > 0;
}

function hasLoginForm(html: string): boolean {
  return cheerio.load(html)(LOGIN_FORM).length > 0;
}
