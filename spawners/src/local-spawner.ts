import express from "express";
import { z } from "zod";
import { Message } from "../../message/index.js";
import { toMessage } from "../../message/src/index.js";
import { toolsWithContext } from "../../tools/index.js";
import { ReadonlyDatabase } from "../../database/index.js";

class ToolNotFoundError extends Error {
  constructor(toolName: string, tools: ReturnType<typeof toolsWithContext>) {
    super(
      `Tool ${toolName} does not exist in the list of tools: ${tools.map((tool: any) => tool.name).join(", ")}`,
    );
  }
}

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
    const { runId, messageId } = req.body;
    if (!runId) {
      res.status(400).json({ error: "runId is required" });
      return;
    }

    if (!messageId) {
      res.status(400).json({ error: "messageId is required" });
      return;
    }

    try {
      const dbMessage = await database.getMessage(runId, messageId);
      const message = toMessage(dbMessage);

      if (!message.tool_calls) {
        res
          .status(400)
          .json({ error: "No tools to execute", details: message });
        return;
      }

      const results = await executeTools(message.tool_calls, tools);
      res.json({ results });
      return;
    } catch (error) {
      if (error instanceof ToolNotFoundError) {
        res
          .status(400)
          .json({ error: "Tool Not found", details: error.message });
        return;
      } else if (error instanceof z.ZodError) {
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

async function executeTools(
  toolCalls: NonNullable<Message["tool_calls"]>,
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
  toolCall: NonNullable<Message["tool_calls"]>[0],
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
