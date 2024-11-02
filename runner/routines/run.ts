import { Database, Message } from "../../database/index.js";
import { toolsWithContext, ToolNotFoundError } from "../../tools/index.js";
import {
  AgentInvokeFactoryConfig,
  AgentInvokeFn,
  AgentInvokeParams,
} from "../model/index.js";
import z from "zod";
// Define the schema for validation
const taskStatusSchema = z.object({
  taskStatus: z.string(),
  reason: z.string(),
});

function extractTaskStatus(
  messages: unknown[],
): z.infer<typeof taskStatusSchema> {
  return messages.reduce<z.infer<typeof taskStatusSchema>>(
    (lastValid, message) => {
      if (
        typeof message === "object" &&
        message !== null &&
        "content" in message
      ) {
        const { content } = message;
        if (typeof content !== "string") {
          return lastValid;
        }
        const jsonMatch = content.match(/```json\s*({[\s\S]*?})\s*```/);
        if (!jsonMatch) {
          return lastValid;
        }
        try {
          const parsedContent = JSON.parse(jsonMatch[1]);
          const validationResult = taskStatusSchema.safeParse(parsedContent);
          if (validationResult.success) {
            return validationResult.data;
          }
        } catch (error) {}
      }
      return lastValid;
    },
    {
      taskStatus: "unknown",
      reason: "Ai didn't express a reason",
    },
  );
}

export async function processRun<
  AgentInvokeFactory extends (
    config: AgentInvokeFactoryConfig,
  ) => Promise<AgentInvokeFn<R, M>>,
  R,
  M,
>(params: {
  runId: string;
  messages: Omit<Message, "id" | "runId">[];
  toolsOnly: boolean;
  database: Database;
  tools: ReturnType<typeof toolsWithContext>;
  agentInvokeFactory: AgentInvokeFactory;
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
    agentInvokeFactory,
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

  let result: R | undefined = undefined;
  if (!toolsOnly) {
    const agentMessages = messages.map(
      (message) => toAgentMessage(message) as M,
    );
    const replayCallback = await replayCallbackFactory({
      database,
      runId,
    });
    const agentInvoke = await agentInvokeFactory({
      tools,
    });
    result = await agentInvoke({
      messages: agentMessages,
      replayCallback,
    });
  }
  const taskStatus = extractTaskStatus(
    result &&
      typeof result === "object" &&
      "messages" in result &&
      Array.isArray(result.messages)
      ? result.messages
      : [],
  );
  await database.updateRunStatus(runId, "done");
  await database.updateRunTaskStatus(
    runId,
    taskStatus.taskStatus,
    taskStatus.reason,
  );
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
