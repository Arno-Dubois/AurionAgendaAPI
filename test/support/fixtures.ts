import { readFileSync } from "node:fs";

const cache = new Map<string, string>();

/** Reads a file from `test/fixtures/aurion/` (generated from a HAR by `npm run fixtures:from-har`). */
export function fixture(name: string): string {
  let content = cache.get(name);
  if (content === undefined) {
    content = readFileSync(new URL(`../fixtures/aurion/${name}`, import.meta.url), "utf8");
    cache.set(name, content);
  }
  return content;
}

export interface RecordedRequests {
  loginFieldNames: string[];
  menuPost: [string, string][];
  planningAjax: [string, string][];
}

export function recordedRequests(): RecordedRequests {
  return JSON.parse(fixture("requests.json")) as RecordedRequests;
}
