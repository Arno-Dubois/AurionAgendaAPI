import { describe, expect, it } from "vitest";
import { AurionLayoutChangedError, SessionExpiredError } from "../../../src/domain/errors.js";
import { PartialResponse } from "../../../src/infrastructure/aurion/PartialResponse.js";
import { fixture } from "../../support/fixtures.js";

const wrap = (inner: string) =>
  `<?xml version='1.0' encoding='UTF-8'?><partial-response id="j_id1">${inner}</partial-response>`;

describe("PartialResponse", () => {
  it("extracts the schedule JSON and the new ViewState from the recorded response", () => {
    const response = PartialResponse.parse(fixture("planning-events.xml"), "test");
    expect(response.viewState).toBe("911817641898978834:7291157091009850521");
    const json = response.update("form:j_idt118");
    expect(json).toMatch(/^\{"events" : \[/);
    expect(() => JSON.parse(json ?? "") as unknown).not.toThrow();
  });

  it("keeps CDATA content verbatim, including markup-like characters", () => {
    const response = PartialResponse.parse(
      wrap(`<changes><update id="x"><![CDATA[{"title": "a <b> & c"}]]></update></changes>`),
      "test",
    );
    expect(response.update("x")).toBe(`{"title": "a <b> & c"}`);
  });

  it("treats a redirect to the login page as an expired session", () => {
    expect(() =>
      PartialResponse.parse(wrap(`<redirect url="/faces/Login.xhtml"></redirect>`), "test"),
    ).toThrow(SessionExpiredError);
  });

  it("treats a ViewExpiredException as an expired session", () => {
    const xml = wrap(
      `<error><error-name>class javax.faces.application.ViewExpiredException</error-name><error-message><![CDATA[gone]]></error-message></error>`,
    );
    expect(() => PartialResponse.parse(xml, "test")).toThrow(SessionExpiredError);
  });

  it("reports other server errors and non-XML answers as layout changes", () => {
    const xml = wrap(
      `<error><error-name>java.lang.NullPointerException</error-name><error-message>boom</error-message></error>`,
    );
    expect(() => PartialResponse.parse(xml, "test")).toThrow(AurionLayoutChangedError);
    expect(() => PartialResponse.parse("<html>maintenance</html>", "test")).toThrow(
      /not a JSF partial-response/,
    );
  });
});
