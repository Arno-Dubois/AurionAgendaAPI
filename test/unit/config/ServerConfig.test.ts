import { describe, expect, it } from "vitest";
import { ConfigError } from "../../../src/config/AurionConfig.js";
import { loadServerConfigFromEnv } from "../../../src/config/ServerConfig.js";

describe("loadServerConfigFromEnv", () => {
  it("applies safe defaults: localhost only, no token, 15 min cache", () => {
    expect(loadServerConfigFromEnv({})).toEqual({
      host: "127.0.0.1",
      port: 3000,
      apiToken: null,
      cacheTtlSeconds: 900,
      logLevel: "info",
    });
  });

  it("parses overrides, and 0 disables the cache", () => {
    const config = loadServerConfigFromEnv({
      HOST: "0.0.0.0",
      PORT: "8080",
      API_TOKEN: "0123456789abcdef0123",
      CACHE_TTL_SECONDS: "0",
      LOG_LEVEL: "debug",
      API_UNRELATED: "ignored",
    });
    expect(config).toMatchObject({ host: "0.0.0.0", port: 8080, cacheTtlSeconds: 0 });
    expect(config.apiToken).toBe("0123456789abcdef0123");
  });

  it("treats an empty API_TOKEN as unset", () => {
    expect(loadServerConfigFromEnv({ API_TOKEN: "" }).apiToken).toBeNull();
  });

  it("rejects short tokens, bad ports and unknown log levels", () => {
    const load = () =>
      loadServerConfigFromEnv({ API_TOKEN: "secret", PORT: "70000", LOG_LEVEL: "loud" });
    expect(load).toThrow(ConfigError);
    expect(load).toThrow(/API_TOKEN: must be at least 16 characters/);
    expect(load).toThrow(/PORT/);
    expect(load).toThrow(/LOG_LEVEL/);
  });
});
