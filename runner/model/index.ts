import { Database } from "../../database/index.js";
import { toolsWithContext } from "../../tools/index.js";
export interface AgentInvokeFactoryConfig {
  tools: ReturnType<typeof toolsWithContext>;
}

export type AgentInvokeFn<R, M> = (params: AgentInvokeParams<M>) => Promise<R>;

export interface AgentInvokeParams<M> {
  messages: M[];
  replayCallback: unknown;
}

export interface RunnerConfig<AgentInvokeFactory, M> {
  tools: ReturnType<typeof toolsWithContext>;
  database: Database;
  agentInvokeFactory: AgentInvokeFactory;
  messages?: M[];
  replayCallbackFactory: (config: {
    database: Database;
    runId: string;
  }) => Promise<unknown>;
}

export type Runner = () => Promise<void>;
