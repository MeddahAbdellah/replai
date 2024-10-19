import { toolsWithContext } from "../../tools/index.js";
import { Database } from "../../database/index.js";
import { Runner } from "../../runner/index.js";
import { AgentInvokeFactoryConfig, AgentInvokeFn } from "../model/index.js";
import { lcReplayCallbackFactory } from "../../langchain/index.js";

export async function localSpawner<
  AgentInvokeFactory extends (
    config: AgentInvokeFactoryConfig,
  ) => Promise<AgentInvokeFn<R, M>>,
  R,
  M,
>(config: {
  identifier: string;
  tools: ReturnType<typeof toolsWithContext>;
  database: Database;
  agentInvokeFactory: AgentInvokeFactory;
  runner: Runner<R, M>;
  messages: M[];
  replayCallbackFactory?: (config: {
    database: Database;
    runId: string;
  }) => Promise<unknown>;
}) {
  const { tools, database, agentInvokeFactory, runner, messages } = config;
  const agentInvoke = await agentInvokeFactory({
    tools,
  });

  const replayCallbackFactory =
    config.replayCallbackFactory ?? lcReplayCallbackFactory;

  await runner({
    tools,
    database,
    agentInvoke,
    messages,
    replayCallbackFactory,
  });
}
