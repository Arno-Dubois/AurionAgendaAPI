import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import { AurionLayoutChangedError } from "../../domain/errors.js";

const VIEW_STATE = "javax.faces.ViewState";
const NON_VALUE_INPUT_TYPES = new Set(["submit", "button", "image", "reset", "file"]);

/**
 * A snapshot of an HTML `<form>` as a browser would submit it.
 *
 * JSF pages are full of generated ids (`j_idt43`, `j_idt118`…) that change between
 * Aurion releases. Instead of hard-coding them, we read every field the way a browser
 * collects them and only override the few values we care about.
 */
export class JsfForm {
  private constructor(
    readonly id: string,
    readonly action: string,
    private readonly fields: readonly (readonly [string, string])[],
    /** First submit button (name, value): what a browser sends when you press Enter. */
    readonly defaultSubmitter: readonly [string, string] | undefined,
  ) {}

  /**
   * @param step human-readable description used in error messages, e.g. "reading the login page".
   */
  static fromHtml(html: string, formSelector: string, step: string): JsfForm {
    const $ = cheerio.load(html);
    const form = $(formSelector).first();
    if (form.length === 0) {
      throw new AurionLayoutChangedError(step, `form "${formSelector}" not found`);
    }
    const fields: [string, string][] = [];
    form.find("input, select, textarea").each((_, element) => {
      for (const field of successfulControl($, element)) fields.push(field);
    });
    const submit = form
      .find("button[type=submit], button:not([type]), input[type=submit]")
      .filter((_, element) => !isDisabled($(element)) && $(element).attr("name") !== undefined)
      .first();
    const defaultSubmitter =
      submit.length > 0
        ? ([submit.attr("name") ?? "", submit.attr("value") ?? ""] as const)
        : undefined;

    return new JsfForm(form.attr("id") ?? "", form.attr("action") ?? "", fields, defaultSubmitter);
  }

  get viewState(): string | undefined {
    return this.fields.find(([name]) => name === VIEW_STATE)?.[1];
  }

  has(name: string): boolean {
    return this.fields.some(([field]) => field === name);
  }

  /**
   * Returns the body to submit. `overrides` replace existing fields with the same name
   * (keeping their position) or are appended; a value of `null` removes the field.
   */
  toBody(overrides: Record<string, string | null> = {}): URLSearchParams {
    const pending = new Map(Object.entries(overrides));
    const body = new URLSearchParams();
    for (const [name, value] of this.fields) {
      if (!pending.has(name)) {
        body.append(name, value);
        continue;
      }
      const override = pending.get(name);
      pending.delete(name);
      if (override !== null && override !== undefined) body.append(name, override);
    }
    for (const [name, value] of pending) {
      if (value !== null) body.append(name, value);
    }
    return body;
  }
}

/** `disabled` on the control itself or on an enclosing `<fieldset>`. */
function isDisabled(control: cheerio.Cheerio<Element>): boolean {
  return control.attr("disabled") !== undefined || control.closest("fieldset[disabled]").length > 0;
}

/** Implements the HTML "constructing the entry list" rules for one control. */
function successfulControl($: cheerio.CheerioAPI, element: Element): [string, string][] {
  const control = $(element);
  const name = control.attr("name");
  if (name === undefined || name === "" || isDisabled(control)) return [];

  switch (element.tagName.toLowerCase()) {
    case "select": {
      const options = control.find("option");
      let selected = options.filter((_, option) => $(option).attr("selected") !== undefined);
      if (selected.length === 0 && control.attr("multiple") === undefined) {
        selected = options.first();
      }
      return selected
        .toArray()
        .map((option) => [name, $(option).attr("value") ?? $(option).text()]);
    }
    case "textarea":
      return [[name, control.text()]];
    default: {
      const type = (control.attr("type") ?? "text").toLowerCase();
      if (NON_VALUE_INPUT_TYPES.has(type)) return [];
      if ((type === "checkbox" || type === "radio") && control.attr("checked") === undefined) {
        return [];
      }
      return [[name, control.attr("value") ?? (type === "checkbox" ? "on" : "")]];
    }
  }
}
