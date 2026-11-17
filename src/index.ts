export {
  type AurionConfig,
  ConfigError,
  DEFAULTS,
  loadConfigFromEnv,
} from "./config/AurionConfig.js";
export { CourseEvent, type CourseEventProps } from "./domain/CourseEvent.js";
export { Credentials } from "./domain/Credentials.js";
export { DateRange } from "./domain/DateRange.js";
export * from "./domain/errors.js";
export type { ScheduleProvider } from "./ports/ScheduleProvider.js";
export { AurionScheduleProvider } from "./infrastructure/aurion/AurionScheduleProvider.js";
