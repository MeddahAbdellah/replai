import express from "express";
import { z } from "zod";
import { Message, MessagesArraySchema } from "../../message/index.js";
import { toMessage } from "../../message/src/index.js";
import { toolsWithContext } from "../../tools/index.js";
import { ReadonlyDatabase } from "../../database/index.js";

export async function localSpawner(config: {
  tools: ReturnType<typeof toolsWithContext>;
  database: ReadonlyDatabase;
  port: number;
}) {
  const { tools, database, port } = config;
  const app = express();
  app.use(express.json());

  app.post("/", handleReplayRequest(tools, database));

  app.listen(port, () => {
    console.log("LangReplay server listening on port 9999");
  });
}

function handleReplayRequest(
  tools: ReturnType<typeof toolsWithContext>,
  database: ReadonlyDatabase,
) {
  return async (req: express.Request, res: express.Response) => {
    const { runId } = req.body;
    if (!runId) {
      res.status(400).json({ error: "runId is required" });
      return;
    }

    try {
      const messages = await database.getAllMessages(runId);
      const validatedMessages = MessagesArraySchema.parse(
        messages.map(toMessage),
      );
      await processMessages(validatedMessages, tools);
      res.json({ success: true, message: "Replay completed" });
      return;
    } catch (error) {
      console.error("Error during replay:", error);
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ error: "Invalid message format", details: error.errors });
        return;
          
      } else {
        res.status(500).json({ error: "Internal server error" });
        return;
      }
    }
  };
}

async function processMessages(
  messages: Message[],
  tools: ReturnType<typeof toolsWithContext>,
) {
  const toolCalls = messages
    .map((message) => message.tool_calls)
    .filter(
      (toolCall): toolCall is NonNullable<Message["tool_calls"]> =>
        toolCall !== undefined,
    );

  for (const toolCall of toolCalls) {
    await executeTools(toolCall, tools);
  }
}

async function executeTools(
  toolCalls: NonNullable<Message["tool_calls"]>,
  tools: ReturnType<typeof toolsWithContext>,
) {
  for (const toolCall of toolCalls) {
    await executeSingleTool(toolCall, tools);
  }
}

async function executeSingleTool(
  toolCall: NonNullable<Message["tool_calls"]>[0],
  tools: ReturnType<typeof toolsWithContext>,
) {
  debugger;
  const tool = tools.find((t) => t.name === toolCall.name);
  if (!tool || !tool.func) {
    console.warn(`Tool ${toolCall.name} not found`);
    return;
  }
  try {
    const result = await tool.func(
      toolCall.args.input as Record<string, unknown>,
    );
    console.log(`Tool ${toolCall.name} executed with result:`, result);
    return result;
  } catch (error) {
    throw error;
  }
}
