import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest, HookHandlerDoneFunction } from "fastify";
import { UnauthorizedError } from "./problem.js";

const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * Returns a function telling whether a candidate equals `secret`.
 *
 * Both sides are hashed first so the comparison is constant-time whatever their lengths.
 */
export function secretMatcher(secret: string): (candidate: string) => boolean {
  const expected = digest(secret);
  return (candidate) => timingSafeEqual(digest(candidate), expected);
}

/** `onRequest` hook requiring `Authorization: Bearer <token>`. */
export function bearerAuth(expectedToken: string) {
  const matches = secretMatcher(expectedToken);
  return (request: FastifyRequest, _reply: FastifyReply, done: HookHandlerDoneFunction): void => {
    const header = request.headers.authorization ?? "";
    const token = /^Bearer\s+(?<token>\S+)$/i.exec(header)?.groups?.token;
    if (token === undefined) {
      done(new UnauthorizedError("Send the API token as `Authorization: Bearer <token>`."));
    } else if (!matches(token)) {
      done(new UnauthorizedError("Invalid API token."));
    } else {
      done();
    }
  };
}
