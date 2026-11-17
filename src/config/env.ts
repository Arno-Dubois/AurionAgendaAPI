import { z } from "zod";

export class ConfigError extends Error {
  override name = "ConfigError";
}

export const positiveInt = (fallback: number) =>
  z.coerce.number().int().positive().default(fallback);

/** Validates `env` against `schema`, treating empty strings as unset so defaults apply. */
export function parseEnv<T extends z.ZodType>(schema: T, env: NodeJS.ProcessEnv): z.output<T> {
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ""));
  const parsed = schema.safeParse(cleaned);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new ConfigError(`Invalid configuration:\n${issues}`);
  }
  return parsed.data;
}
