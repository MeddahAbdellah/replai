import { Database, Message } from "../../database/index.js";
import { toolsWithContext, ToolNotFoundError } from "../../tools/index.js";
import { AgentInvokeParams } from "../model/index.js";

export async function processRun<M, R>(params: {
  runId: string;
  messages: Omit<Message, "id" | "runId">[];
  toolsOnly: boolean;
  database: Database;
  tools: ReturnType<typeof toolsWithContext>;
  agentInvoke: (params: AgentInvokeParams<M>) => Promise<R>;
  toAgentMessage: (message: Omit<Message, "id" | "runId">) => M;
  replayCallbackFactory: (config: {
    database: Database;
    runId: string;
  }) => Promise<unknown>;
}): Promise<void> {
  const {
    runId,
    messages,
    toolsOnly,
    database,
    tools,
    agentInvoke,
    toAgentMessage,
    replayCallbackFactory,
  } = params;
  await database.updateRunStatus(runId, "running");
  const messagesWithToolCalls = messages.filter(
    (message) => message.toolCalls && message.toolCalls.length > 0,
  );

  for (let toolCallMessage of messagesWithToolCalls) {
    if (!toolCallMessage.toolCalls) {
      continue;
    }
    await executeTools(toolCallMessage.toolCalls, tools);
  }

  let result;
  if (!toolsOnly) {
    const agentMessages = messages.map(
      (message) => toAgentMessage(message) as M,
    );
    const replayCallback = await replayCallbackFactory({
      database,
      runId,
    });
    result = await agentInvoke({
      messages: agentMessages,
      replayCallback,
    });
  }
  await database.updateRunStatus(runId, "done");
  if (
    result &&
    typeof result === "object" &&
    "status" in result &&
    typeof result.status === "string"
  ) {
    await database.updateRunTaskStatus(runId, result.status);
  }
}

async function executeTools(
  toolCalls: NonNullable<Message["toolCalls"]>,
  tools: ReturnType<typeof toolsWithContext>,
) {
  const results = [];
  for (const toolCall of toolCalls) {
    const result = await executeSingleTool(toolCall, tools);
    results.push(result);
  }
  return results;
}

async function executeSingleTool(
  toolCall: NonNullable<Message["toolCalls"]>[0],
  tools: ReturnType<typeof toolsWithContext>,
) {
  const tool = tools.find((t: any) => t.name === toolCall.name);
  if (!tool || !tool.func) {
    throw new ToolNotFoundError(toolCall.name, tools);
  }
  try {
    const result = await tool.invoke(
      toolCall.args.input as Record<string, unknown>,
    );
    return { toolCallName: toolCall.name, result };
  } catch (error) {
    throw error;
  }
}
