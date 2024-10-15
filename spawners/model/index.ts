import { toolsWithContext } from "../../tools/index.js";
import { AgentInvokeParams } from "../../runner/index.js";

export interface AgentInvokeFactoryConfig {
  tools: ReturnType<typeof toolsWithContext>;
}

export type AgentInvokeFn<R, M> = (params: AgentInvokeParams<M>) => Promise<R>;
