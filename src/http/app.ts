import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { z } from "zod";
import type { ScheduleService } from "../application/ScheduleService.js";
import { bearerAuth } from "./auth.js";
import { serializeRequest } from "./logging.js";
import { errorHandler, problem, sendProblem } from "./problem.js";
import { type CalendarFeedOptions, calendarRoutes } from "./routes/calendar.js";
import { eventRoutes } from "./routes/events.js";

export interface AppOptions {
  service: ScheduleService;
  /** When set, /v1 routes require `Authorization: Bearer <apiToken>`. */
  apiToken?: string | null;
  /** When set, serves the iCal feed at `/cal/<token>.ics`. */
  calendar?: CalendarFeedOptions | null;
  /** Request URLs are always logged with secrets redacted. */
  logger?: FastifyServerOptions["logger"];
  version?: string;
}

/**
 * Builds the HTTP application without starting it, so tests can drive it with `inject()`.
 */
export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const { service, apiToken = null, calendar = null, logger = false, version = "0.0.0" } = options;
  const app = Fastify({ logger: withSafeSerializers(logger) }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler((request, reply) =>
    sendProblem(reply, problem(404, "NOT_FOUND", `No route for ${request.method} ${request.url}.`)),
  );

  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: "AurionAgendaAPI",
        description:
          "Your Aurion timetable as JSON. Errors use RFC 9457 problem details " +
          "(`application/problem+json`) with a machine-readable `code`.",
        version,
        license: { name: "MIT" },
      },
      ...(apiToken === null
        ? {}
        : {
            components: {
              securitySchemes: { bearerAuth: { type: "http" as const, scheme: "bearer" } },
            },
            security: [{ bearerAuth: [] }],
          }),
    },
    transform: jsonSchemaTransform,
  });
  await app.register(fastifySwaggerUi, { routePrefix: "/docs" });

  app.get("/", { schema: { hide: true } }, (_request, reply) => reply.redirect("/docs"));

  app.get(
    "/health",
    {
      schema: {
        tags: ["health"],
        summary: "Liveness check (does not contact Aurion)",
        security: [],
        response: { 200: z.object({ status: z.literal("ok"), uptimeSeconds: z.number() }) },
      },
    },
    () => ({ status: "ok" as const, uptimeSeconds: Math.round(process.uptime()) }),
  );

  await app.register(
    async (v1) => {
      if (apiToken !== null) v1.addHook("onRequest", bearerAuth(apiToken));
      // Timetables are personal: never let a proxy or browser cache store them.
      v1.addHook("onSend", async (_request, reply) => {
        reply.header("Cache-Control", "no-store");
      });
      await v1.register(eventRoutes(service));
    },
    { prefix: "/v1" },
  );

  if (calendar !== null) await app.register(calendarRoutes(service, calendar));

  return app;
}

function withSafeSerializers(
  logger: AppOptions["logger"],
): Exclude<AppOptions["logger"], undefined> {
  if (logger === false || logger === undefined) return false;
  const options = logger === true ? {} : logger;
  return { ...options, serializers: { req: serializeRequest, ...options.serializers } };
}
