import { Database } from "../../database/index.js";
import { toolsWithContext } from "../../tools/index.js";

export interface AgentInvokeParams<M> {
  messages: M[];
  replayCallback: unknown;
}

export type Runner<R, M> = (params: {
  tools: ReturnType<typeof toolsWithContext>;
  database: Database;
  agentInvoke: (params: AgentInvokeParams<M>) => Promise<R>;
  messages: M[];
  replayCallbackFactory: (config: {
    database: Database;
    runId: string;
  }) => Promise<unknown>;
}) => Promise<void>;
