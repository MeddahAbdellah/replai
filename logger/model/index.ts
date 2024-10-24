export const logLevels = {
  info: "INFO",
  warn: "WARN",
  error: "ERROR",
} as const;

export type LogLevel = (typeof logLevels)[keyof typeof logLevels];

export interface Logger {
  info: (...messages: unknown[]) => void;
  warn: (...messages: unknown[]) => void;
  error: (errors: Error) => void;
}
