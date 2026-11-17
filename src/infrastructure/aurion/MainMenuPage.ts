import * as cheerio from "cheerio";
import { AurionLayoutChangedError, SessionExpiredError } from "../../domain/errors.js";
import { type AurionHttpClient, isLoginUrl } from "./AurionHttpClient.js";
import { JsfForm } from "./JsfForm.js";
import { PlanningPage } from "./PlanningPage.js";

const SIDEBAR_FORM = 'form:has([id$=":sidebar"])';
const MENU_ID_PATTERN = /['"]([\w-]+:sidebar_menuid)['"]\s*:\s*['"]([^'"]+)['"]/;
const SIDEBAR_PATTERN = /['"]([\w-]+:sidebar)['"]\s*:\s*['"]([^'"]+)['"]/;

export interface SidebarItem {
  cssClass: string;
  label: string;
}

/** Aurion home page (`MainMenuPage.xhtml`), used only to navigate through its sidebar. */
export class MainMenuPage {
  private constructor(
    private readonly $: cheerio.CheerioAPI,
    private readonly form: JsfForm,
  ) {}

  static fromHtml(html: string): MainMenuPage {
    const step = "reading the home page";
    return new MainMenuPage(cheerio.load(html), JsfForm.fromHtml(html, SIDEBAR_FORM, step));
  }

  /** Sidebar links with their `item_…` class, handy to configure another Aurion instance. */
  listSidebarItems(): SidebarItem[] {
    return this.$("a.ui-menuitem-link[onclick]")
      .toArray()
      .flatMap((link) => {
        const cssClass = (this.$(link).attr("class") ?? "")
          .split(/\s+/)
          .find((name) => name.startsWith("item_"));
        const label = this.$(link).find(".ui-menuitem-text").text().trim();
        return cssClass === undefined ? [] : [{ cssClass, label }];
      });
  }

  /**
   * Reads the sidebar submit parameters of the link with class `menuItemClass`, e.g.
   * `{'form:sidebar':'form:sidebar','form:sidebar_menuid':'1'}`.
   *
   * We read the menu id from the link's own `onclick` rather than from its position in the
   * list (as the old bot did), so it stays right when Aurion adds or reorders entries.
   */
  sidebarParamsFor(menuItemClass: string): Record<string, string> {
    const step = "finding the planning link in the sidebar";
    const link = this.$(`a.${menuItemClass}`).first();
    if (link.length === 0) {
      const available = this.listSidebarItems()
        .map((item) => `${item.cssClass} ("${item.label}")`)
        .join(", ");
      throw new AurionLayoutChangedError(
        step,
        `no link with class "${menuItemClass}". Set AURION_PLANNING_MENU_ITEM to one of: ${available || "(none found)"}`,
      );
    }
    const onclick = link.attr("onclick") ?? "";
    const menuId = MENU_ID_PATTERN.exec(onclick);
    const sidebar = SIDEBAR_PATTERN.exec(onclick);
    if (menuId?.[1] === undefined || menuId[2] === undefined) {
      throw new AurionLayoutChangedError(step, `cannot read the menu id from: ${onclick}`);
    }
    const params: Record<string, string> = { [menuId[1]]: menuId[2] };
    if (sidebar?.[1] !== undefined && sidebar[2] !== undefined) params[sidebar[1]] = sidebar[2];
    return params;
  }

  async openPlanning(http: AurionHttpClient, menuItemClass: string): Promise<PlanningPage> {
    const body = this.form.toBody(this.sidebarParamsFor(menuItemClass));
    const response = await http.postForm(this.form.action, body);
    if (isLoginUrl(response.location)) throw new SessionExpiredError();
    const page = await http.followRedirects(response, { allowLogin: false });
    return PlanningPage.fromHtml(page.body);
  }
}
