import { describe, expect, it } from "vitest";
import { AurionLayoutChangedError } from "../../../src/domain/errors.js";
import { JsfForm } from "../../../src/infrastructure/aurion/JsfForm.js";
import { MainMenuPage } from "../../../src/infrastructure/aurion/MainMenuPage.js";
import { fixture, recordedRequests } from "../../support/fixtures.js";

/** Fields that Aurion's JavaScript fills in the browser; we cannot (and need not) reproduce them. */
const SET_BY_JAVASCRIPT = new Set(["form:largeurDivCenter", "form:offsetFuseauNavigateur"]);

const withoutJsFields = (entries: Iterable<[string, string]>) =>
  [...entries].filter(([name]) => !SET_BY_JAVASCRIPT.has(name)).sort();

describe("JsfForm, against the requests recorded in the HAR", () => {
  it("rebuilds the sidebar navigation POST exactly like the browser", () => {
    const html = fixture("home-page.html");
    const form = JsfForm.fromHtml(html, 'form:has([id$=":sidebar"])', "test");
    const body = form.toBody(MainMenuPage.fromHtml(html).sidebarParamsFor("item_2169484"));

    expect(withoutJsFields(body)).toEqual(withoutJsFields(recordedRequests().menuPost));
  });

  it("rebuilds the planning AJAX POST exactly like the browser", () => {
    const recorded = new URLSearchParams(recordedRequests().planningAjax);
    const form = JsfForm.fromHtml(fixture("planning-page.html"), "form:has(div.schedule)", "test");
    const id = "form:j_idt118";
    const body = form.toBody({
      "javax.faces.partial.ajax": "true",
      "javax.faces.source": id,
      "javax.faces.partial.execute": id,
      "javax.faces.partial.render": id,
      [id]: id,
      [`${id}_start`]: recorded.get(`${id}_start`),
      [`${id}_end`]: recorded.get(`${id}_end`),
    });

    expect(withoutJsFields(body)).toEqual(withoutJsFields(recorded));
  });

  it("reads the ViewState and the login submit button", () => {
    const form = JsfForm.fromHtml(
      fixture("login-page.html"),
      "form:has(input[type=password])",
      "test",
    );
    expect(form.action).toBe("/login");
    expect(form.defaultSubmitter).toEqual(["j_idt43", ""]);
    expect(recordedRequests().loginFieldNames).toEqual(["username", "password", "j_idt43"]);
  });
});

describe("JsfForm, browser form rules", () => {
  const html = `
    <form id="f" action="/submit">
      <input name="text" value="a b&c" />
      <input name="empty" />
      <input name="disabled" value="x" disabled />
      <input type="checkbox" name="unchecked" value="1" />
      <input type="checkbox" name="checked" checked />
      <input type="radio" name="choice" value="no" />
      <input type="radio" name="choice" value="yes" checked />
      <select name="first"><option value="1">One</option><option value="2">Two</option></select>
      <select name="selected"><option value="1">One</option><option value="2" selected>Two</option></select>
      <select name="multi" multiple><option value="1">One</option></select>
      <select name="off" disabled><option value="1">One</option></select>
      <fieldset disabled><input name="in-disabled-fieldset" value="x" /></fieldset>
      <textarea name="area">hello</textarea>
      <input type="submit" name="go" value="Go" />
      <input type="hidden" name="javax.faces.ViewState" value="123:456" />
    </form>`;
  const form = JsfForm.fromHtml(html, "#f", "test");

  it("collects only successful controls", () => {
    expect([...form.toBody()]).toEqual([
      ["text", "a b&c"],
      ["empty", ""],
      ["checked", "on"],
      ["choice", "yes"],
      ["first", "1"],
      ["selected", "2"],
      ["area", "hello"],
      ["javax.faces.ViewState", "123:456"],
    ]);
    expect(form.viewState).toBe("123:456");
    expect(form.defaultSubmitter).toEqual(["go", "Go"]);
  });

  it("replaces in place, appends new fields and removes null overrides", () => {
    const body = form.toBody({ empty: "filled", text: null, extra: "1" });
    expect(body.get("empty")).toBe("filled");
    expect(body.has("text")).toBe(false);
    expect([...body.keys()].at(-1)).toBe("extra");
  });

  it("URL-encodes special characters (the old bot did not)", () => {
    const body = form.toBody({ password: "p&ss=w+rd%" }).toString();
    expect(body).toContain("password=p%26ss%3Dw%2Brd%25");
  });

  it("throws a layout error when the form is missing", () => {
    expect(() => JsfForm.fromHtml("<p>nope</p>", "form#login", "reading the login page")).toThrow(
      AurionLayoutChangedError,
    );
  });
});
