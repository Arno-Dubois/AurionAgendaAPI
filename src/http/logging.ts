import type { FastifyRequest } from "fastify";

/** Path segment holding the calendar secret: `/cal/<token>.ics`. */
const CALENDAR_SECRET = /^(\/cal\/)[^/?#]+/;

/** Hides secrets carried in the URL, so they never reach the logs. */
export function redactUrl(url: string): string {
  return url.replace(CALENDAR_SECRET, "$1[REDACTED]");
}

/** Same fields as Fastify's default request serializer, with the URL redacted. */
export function serializeRequest(request: FastifyRequest) {
  const { remotePort } = request.socket;
  return {
    method: request.method,
    url: redactUrl(request.url),
    host: request.host,
    remoteAddress: request.ip,
    ...(remotePort === undefined ? {} : { remotePort }),
  };
}
