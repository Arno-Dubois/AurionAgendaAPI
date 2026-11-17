import { describe, expect, it } from "vitest";
import { ConfigError, DEFAULTS, loadConfigFromEnv } from "../../../src/config/AurionConfig.js";

const minimal = { AURION_USERNAME: "jane.doe", AURION_PASSWORD: "s3cret" };

describe("loadConfigFromEnv", () => {
  it("applies defaults", () => {
    const config = loadConfigFromEnv(minimal);
    expect(config.baseUrl.href).toBe(`${DEFAULTS.baseUrl}/`);
    expect(config.timezone).toBe("Europe/Paris");
    expect(config.planningMenuItemClass).toBe("item_2169484");
    expect(config.maxRangeDays).toBe(366);
    expect(config.requestTimeoutMs).toBe(30_000);
    expect(config.credentials.username).toBe("jane.doe");
    expect(config.credentials.revealPassword()).toBe("s3cret");
  });

  it("parses overrides and treats empty strings as unset", () => {
    const config = loadConfigFromEnv({
      ...minimal,
      AURION_BASE_URL: "https://aurion.example.org",
      AURION_TIMEZONE: "",
      AURION_MAX_RANGE_DAYS: "100",
    });
    expect(config.baseUrl.host).toBe("aurion.example.org");
    expect(config.timezone).toBe("Europe/Paris");
    expect(config.maxRangeDays).toBe(100);
  });

  it("names every invalid variable in one error", () => {
    let error: unknown;
    try {
      loadConfigFromEnv({ AURION_TIMEZONE: "Mars/Olympus", AURION_MAX_RANGE_DAYS: "-1" });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ConfigError);
    const message = (error as Error).message;
    for (const name of [
      "AURION_USERNAME",
      "AURION_PASSWORD",
      "AURION_TIMEZONE",
      "AURION_MAX_RANGE_DAYS",
    ]) {
      expect(message).toContain(name);
    }
  });

  it("does not echo the password in validation errors", () => {
    expect(() => loadConfigFromEnv({ AURION_PASSWORD: "s3cret" })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining("s3cret") as unknown }),
    );
  });

  it("rejects a menu item that is not a bare class name", () => {
    expect(() => loadConfigFromEnv({ ...minimal, AURION_PLANNING_MENU_ITEM: "a, script" })).toThrow(
      /AURION_PLANNING_MENU_ITEM/,
    );
  });
});
