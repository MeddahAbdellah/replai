import { ReadonlyDatabase } from "../../database/index.js";
import { toolsWithContext, ToolNotFoundError } from "../../tools/index.js";
import express from "express";
import { z } from "zod";
import cors from "cors";
import { Message, Runner } from "../model/index.js";
import { toMessage } from "../mappers/toMessage.js";
import { LangChainHumanMessageToParameterizedMessage } from "../mappers/toParameterizedMessage.js";
import { langChainToDbMessage } from "../../database/mappers/langchain.js";

export function httpRunner<R = unknown, M = unknown>(config: {
  port: number;
  corsOptions?: cors.CorsOptions;
}): Runner<R, M> {
  const { port, corsOptions = { origin: "*" } } = config;
  return async (params) => {
    const { tools, database, agentInvoke, messages, replayCallbackFactory } =
      params;
    const app = express();
    app.use(express.json());
    app.use(cors(corsOptions));

    app.post("/replay", handleReplayRequest(tools, database));

    app.post("/invoke", async (req, res) => {
      const parameters = req.body;
      const parameterizedMessages = messages.map(
        LangChainHumanMessageToParameterizedMessage(parameters),
      );
      const { runId } = await database.createRun();
      await database.insertMessages(
        runId,
        parameterizedMessages.map(langChainToDbMessage),
      );
      const replayCallback = await replayCallbackFactory({ database, runId });
      const result = await agentInvoke({
        messages: parameterizedMessages,
        replayCallback,
      });
      res.json(result);
    });

    app.get("/health-check", (_req, res) => {
      res.json({ status: "ok" });
    });

    app.get("/runs", async (_req, res) => {
      try {
        const runs = await database.getAllRuns();
        res.json(runs);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch runs" });
      }
    });

    app.get("/runs/:runId/messages", async (req, res) => {
      try {
        const { runId } = req.params;
        const messages = await database.getAllMessages(runId);
        res.json(messages);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch messages" });
      }
    });

    app.get("/runs/:runId/messages/:messageId", async (req, res) => {
      try {
        const { runId, messageId } = req.params;
        const message = await database.getMessage(runId, messageId);
        if (message) {
          res.json(message);
        } else {
          res.status(404).json({ error: "Message not found" });
        }
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch message" });
      }
    });

    app.listen(port, () => {
      console.log(`LangReplay runner listening on port ${port}`);
    });
  };
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
