import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { hasZodFastifySchemaValidationErrors } from "fastify-type-provider-zod";
import { STATUS_CODES } from "node:http";
import {
  AurionAgendaError,
  AurionLayoutChangedError,
  AurionUnavailableError,
  InvalidCredentialsError,
  InvalidDateExpressionError,
  InvalidRangeError,
} from "../domain/errors.js";
import type { Problem } from "./schemas.js";

/** Thrown by the auth hook. */
export class UnauthorizedError extends Error {
  override name = "UnauthorizedError";
}

/** A resource that does not exist, or that the caller may not know exists. */
export class NotFoundError extends Error {
  override name = "NotFoundError";
}

export function problem(status: number, code: string, detail: string): Problem {
  return { type: "about:blank", title: STATUS_CODES[status] ?? "Error", status, detail, code };
}

/** Seconds a client should wait before retrying when Aurion is down. */
const RETRY_AFTER_SECONDS = 60;

/** Maps an error to an HTTP problem. Messages of unexpected errors are not exposed. */
export function toProblem(error: unknown): Problem {
  if (hasZodFastifySchemaValidationErrors(error)) {
    return problem(400, "INVALID_REQUEST", error.message);
  }
  if (error instanceof UnauthorizedError) {
    return problem(401, "UNAUTHORIZED", error.message);
  }
  if (error instanceof NotFoundError) {
    return problem(404, "NOT_FOUND", error.message);
  }
  if (error instanceof InvalidDateExpressionError || error instanceof InvalidRangeError) {
    return problem(400, error.code, error.message);
  }
  if (error instanceof InvalidCredentialsError) {
    return problem(
      502,
      error.code,
      "Aurion rejected the credentials configured on this server (AURION_USERNAME / AURION_PASSWORD).",
    );
  }
  if (error instanceof AurionUnavailableError) {
    return problem(503, error.code, `${error.message.replace(/\.?$/, ".")} Try again later.`);
  }
  if (error instanceof AurionLayoutChangedError || error instanceof AurionAgendaError) {
    return problem(502, error.code, error.message);
  }
  const status = (error as Partial<FastifyError>).statusCode;
  if (status !== undefined && status >= 400 && status < 500) {
    return problem(status, (error as FastifyError).code, (error as FastifyError).message);
  }
  return problem(500, "INTERNAL_ERROR", "Unexpected server error. See the server logs.");
}

export function sendProblem(reply: FastifyReply, value: Problem): FastifyReply {
  if (value.status === 401) reply.header("WWW-Authenticate", 'Bearer realm="aurion-agenda"');
  if (value.status === 503) reply.header("Retry-After", String(RETRY_AFTER_SECONDS));
  return reply.status(value.status).type("application/problem+json").send(value);
}

export function errorHandler(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  const value = toProblem(error);
  if (value.status === 500) {
    request.log.error({ err: error }, "unexpected error");
  } else if (value.status >= 500) {
    // Aurion problems are expected from time to time: no stack trace needed.
    request.log.warn({ code: value.code }, value.detail);
  } else {
    request.log.info({ code: value.code }, value.detail);
  }
  return sendProblem(reply, value);
}
