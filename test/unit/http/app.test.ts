import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ScheduleService } from "../../../src/application/ScheduleService.js";
import {
  AurionLayoutChangedError,
  AurionUnavailableError,
  InvalidCredentialsError,
} from "../../../src/domain/errors.js";
import { buildApp } from "../../../src/http/app.js";
import { fixedClock, InMemoryScheduleProvider } from "../../support/InMemoryScheduleProvider.js";

const TOKEN = "test-token-0123456789";

interface ScheduleBody {
  from: string;
  to: string;
  timezone: string;
  count: number;
  events: Record<string, unknown>[];
}

describe("HTTP API (recorded school year, Thursday 19 Nov 2026 10:00)", () => {
  let provider: InMemoryScheduleProvider;
  let app: FastifyInstance;

  async function start(apiToken: string | null = null) {
    const service = new ScheduleService(provider, fixedClock("2026-11-19T10:00"), {
      timezone: "Europe/Paris",
      maxRangeDays: 366,
    });
    app = await buildApp({ service, apiToken, version: "1.2.3" });
  }

  const get = (url: string, headers: Record<string, string> = {}) =>
    app.inject({ method: "GET", url, headers });

  beforeEach(async () => {
    provider = new InMemoryScheduleProvider();
    await start();
  });

  afterEach(async () => {
    await app.close();
  });

  describe("GET /v1/events", () => {
    it("returns the events of an absolute range", async () => {
      const response = await get("/v1/events?from=2026-11-16&to=2026-11-20");

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toMatch(/^application\/json/);
      expect(response.headers["cache-control"]).toBe("no-store");
      const body = response.json<ScheduleBody>();
      expect(body).toMatchObject({
        from: "2026-11-16T00:00:00.000+01:00",
        to: "2026-11-21T00:00:00.000+01:00",
        timezone: "Europe/Paris",
        count: 10,
      });
      expect(body.events[0]).toEqual({
        id: "49806bcb-6475-405f-bfcd-6da5d41a3784",
        start: "2026-11-16T09:00:00.000+01:00",
        end: "2026-11-16T12:00:00.000+01:00",
        title: "Human Aspects of Management",
        subject: "Human Aspects of Management",
        description: "annulé sera décalé",
        room: "BORDEAUX_032_SALLE_CODESIGN",
        kind: "COURS_TD",
        teacher: "Mr TEACHER_A",
        isExam: false,
      });
    });

    it("defaults to the next 7 whole days", async () => {
      const body = (await get("/v1/events")).json<ScheduleBody>();
      expect(body.from).toBe("2026-11-19T00:00:00.000+01:00");
      expect(body.to).toBe("2026-11-26T00:00:00.000+01:00");
    });

    it("accepts relative dates, with + left unencoded in the URL", async () => {
      const body = (await get("/v1/events?from=now&to=+PT6H")).json<ScheduleBody>();
      expect(body.from).toBe("2026-11-19T10:00:00.000+01:00");
      expect(body.to).toBe("2026-11-19T16:00:00.000+01:00");
      expect(body.events.map((e) => e.kind)).toEqual(["TP", "ASSOCIATIF"]);

      const encoded = (await get("/v1/events?from=now&to=%2BPT6H")).json<ScheduleBody>();
      expect(encoded.to).toBe(body.to);
    });

    it("rejects an unknown expression with a problem document", async () => {
      const response = await get("/v1/events?from=tomorow");
      expect(response.statusCode).toBe(400);
      expect(response.headers["content-type"]).toMatch(/^application\/problem\+json/);
      expect(response.json()).toMatchObject({
        type: "about:blank",
        title: "Bad Request",
        status: 400,
        code: "INVALID_DATE_EXPRESSION",
        detail: expect.stringContaining('"tomorow"') as unknown,
      });
      expect(provider.calls).toHaveLength(0);
    });

    it("rejects ranges longer than the limit, and inverted ranges", async () => {
      const tooLong = await get("/v1/events?from=2026-01-01&to=2027-06-30");
      expect(tooLong.statusCode).toBe(400);
      expect(tooLong.json()).toMatchObject({ code: "RANGE_TOO_LARGE" });

      const inverted = await get("/v1/events?from=tomorrow&to=yesterday");
      expect(inverted.json()).toMatchObject({ status: 400, code: "INVALID_RANGE" });
    });

    it("rejects overly long parameters during validation", async () => {
      const response = await get(`/v1/events?from=${"x".repeat(100)}`);
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: "INVALID_REQUEST" });
    });
  });

  it("GET /v1/events/today", async () => {
    const body = (await get("/v1/events/today")).json<ScheduleBody>();
    expect(body.count).toBe(3);
    expect(body.from).toBe("2026-11-19T00:00:00.000+01:00");
  });

  it("GET /v1/events/week?offset=1", async () => {
    const body = (await get("/v1/events/week?offset=1")).json<ScheduleBody>();
    expect(body.from).toBe("2026-11-23T00:00:00.000+01:00");
    expect(body.to).toBe("2026-11-30T00:00:00.000+01:00");
    expect(body.events.filter((e) => e.isExam)).toHaveLength(1);

    const invalid = await get("/v1/events/week?offset=abc");
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({ code: "INVALID_REQUEST" });
  });

  it("GET /v1/events/current", async () => {
    const body = (await get("/v1/events/current")).json<{
      at: string;
      events: { kind: string }[];
    }>();
    expect(body.at).toBe("2026-11-19T10:00:00.000+01:00");
    expect(body.events.map((e) => e.kind)).toEqual(["TP"]);
  });

  it("GET /v1/events/next", async () => {
    const body = (await get("/v1/events/next")).json<{ event: { start: string } | null }>();
    expect(body.event?.start).toBe("2026-11-19T15:30:00.000+01:00");
  });

  describe("Aurion failures", () => {
    it.each([
      [new InvalidCredentialsError(), 502, "INVALID_CREDENTIALS", /AURION_USERNAME/],
      [new AurionUnavailableError("Aurion timed out."), 503, "AURION_UNAVAILABLE", /timed out/],
      [
        new AurionLayoutChangedError("opening the planning", "no form"),
        502,
        "AURION_LAYOUT_CHANGED",
        /no form/,
      ],
    ])("maps %s", async (error, status, code, detail) => {
      provider.failNextWith = error;
      const response = await get("/v1/events/today");
      expect(response.statusCode).toBe(status);
      expect(response.json()).toMatchObject({
        status,
        code,
        detail: expect.stringMatching(detail) as unknown,
      });
    });

    it("asks clients to retry later when Aurion is down", async () => {
      provider.failNextWith = new AurionUnavailableError("down");
      const response = await get("/v1/events/today");
      expect(response.headers["retry-after"]).toBe("60");
    });

    it("hides the message of unexpected errors", async () => {
      provider.failNextWith = new Error("secret internal detail");
      const response = await get("/v1/events/today");
      expect(response.statusCode).toBe(500);
      expect(response.body).not.toContain("secret internal detail");
      expect(response.json()).toMatchObject({ code: "INTERNAL_ERROR" });
    });
  });

  it("answers unknown routes with a 404 problem", async () => {
    const response = await get("/v1/nope");
    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).toMatch(/^application\/problem\+json/);
    expect(response.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("GET /health does not touch Aurion", async () => {
    const response = await get("/health");
    expect(response.json()).toMatchObject({ status: "ok" });
    expect(provider.calls).toHaveLength(0);
  });

  it("serves the OpenAPI document and Swagger UI", async () => {
    const spec = (await get("/docs/json")).json<{
      info: { version: string };
      paths: Record<string, unknown>;
    }>();
    expect(spec.info.version).toBe("1.2.3");
    expect(Object.keys(spec.paths)).toEqual(
      expect.arrayContaining([
        "/health",
        "/v1/events",
        "/v1/events/today",
        "/v1/events/week",
        "/v1/events/current",
        "/v1/events/next",
      ]),
    );
    expect((await get("/docs")).statusCode).toBeLessThan(400);
    expect((await get("/")).headers.location).toBe("/docs");
  });

  describe("with API_TOKEN", () => {
    beforeEach(async () => {
      await app.close();
      await start(TOKEN);
    });

    it("rejects requests without a bearer token", async () => {
      const response = await get("/v1/events/today");
      expect(response.statusCode).toBe(401);
      expect(response.headers["www-authenticate"]).toMatch(/^Bearer/);
      expect(response.json()).toMatchObject({ code: "UNAUTHORIZED" });
      expect(provider.calls).toHaveLength(0);
    });

    it("rejects a wrong token", async () => {
      const response = await get("/v1/events/today", { authorization: "Bearer wrong" });
      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ detail: "Invalid API token." });
    });

    it("accepts the right token", async () => {
      const response = await get("/v1/events/today", { authorization: `Bearer ${TOKEN}` });
      expect(response.statusCode).toBe(200);
    });

    it("leaves /health and /docs open, and documents the scheme", async () => {
      expect((await get("/health")).statusCode).toBe(200);
      const spec = (await get("/docs/json")).json<{ components: { securitySchemes: object } }>();
      expect(spec.components.securitySchemes).toHaveProperty("bearerAuth");
    });
  });
});
