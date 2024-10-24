import { Logger, logLevels } from "../model/index.js";

export function consoleLogger(): Logger {
  return {
    info: (...messages: unknown[]) => {
      console.info(`[${new Date().toISOString()}] ${logLevels.info}: `);
      console.dir(messages, {
        depth: Infinity,
        colors: true,
      });
    },
    warn: (...messages: unknown[]) => {
      console.warn(`[${new Date().toISOString()}] ${logLevels.warn}: `);
      console.dir(messages, {
        depth: Infinity,
        colors: true,
      });
    },
    error: (error: Error) => {
      console.error(
        `[${new Date().toISOString()}] ${logLevels.error}: ${error.message}`,
      );
    },
  };
}
