import { toolsWithContext } from "../../tools/index.js";
import { Database } from "../../database/index.js";
import { replayCallback } from "../../callbacks/index.js";
import { Runner } from "../../runner/index.js";

type InferAgentInvokeFunction<T> = T extends (tools: any) => Promise<infer R>
  ? R extends { invoke: infer InvokeFunction }
    ? InvokeFunction
    : never
  : never;
// TODO: fix type to ensure that agentFactory returns an object with an invoke method
export async function localSpawner<TAgentFactory extends Function>(config: {
  name: string;
  tools: ReturnType<typeof toolsWithContext>;
  database: Database;
  agentFactory: TAgentFactory;
  invokeProps: Parameters<InferAgentInvokeFunction<TAgentFactory>>;
  runner: Runner<
    Parameters<InferAgentInvokeFunction<TAgentFactory>>[0],
    Parameters<InferAgentInvokeFunction<TAgentFactory>>[1],
    ReturnType<InferAgentInvokeFunction<TAgentFactory>>
  >;
}) {
  const { tools, database, agentFactory, name, invokeProps, runner } = config;
  const invokeInputs = invokeProps[0];
  const invokeOptions = invokeProps[1];
  const callbacksWithReplay = [
    ...(typeof invokeOptions === "object" &&
    invokeOptions &&
    "callbacks" in invokeOptions &&
    Array.isArray(invokeOptions.callbacks)
      ? invokeOptions.callbacks
      : []),
    await replayCallback({ agentName: name, database }),
  ];
  const agent = await agentFactory(tools);
  const invokePropsWithReplay = [
    invokeInputs,
    {
      ...(invokeOptions && typeof invokeOptions === "object"
        ? invokeOptions
        : {}),
      callbacks: callbacksWithReplay,
    },
  ] as const;
  await runner({
    tools,
    database,
    invokeProps: invokePropsWithReplay,
    agent,
    agentName: name,
  });
}
