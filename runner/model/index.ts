import { Database } from "../../database/index.js";
import { toolsWithContext } from "../../tools/index.js";

export type Runner<T, U, R> = (params: {
  tools: ReturnType<typeof toolsWithContext>;
  database: Database;
  invokeProps: readonly [T, U];
  agent: { invoke: (input: T, options: U) => Promise<R> };
}) => Promise<void>;
