import { Message, ReadonlyDatabase } from "../../database/index.js";
import { toolsWithContext, ToolNotFoundError } from "../../tools/index.js";
import express from "express";
import { z } from "zod";
import cors from "cors";
import { Runner } from "../model/index.js";
import {
  lcToDbMessage,
  lcHumanMessageToParameterizedMessage,
} from "../../langchain/index.js";

export function httpRunner<R = unknown, M = unknown>(config: {
  port: number;
  corsOptions?: cors.CorsOptions;
  messageParameterizationFn?: (
    parameters: Record<string, string>,
  ) => (message: M) => M;
  messageToDbMessageFn?: (message: M) => Omit<Message, "runId">;
}): Runner<R, M> {
  const {
    port,
    corsOptions = { origin: "*" },
    messageParameterizationFn = lcHumanMessageToParameterizedMessage,
    messageToDbMessageFn = lcToDbMessage,
  } = config;
  return async (params) => {
    const {
      tools,
      database,
      agentInvoke,
      messages: messagesFromConfig,
      replayCallbackFactory,
    } = params;
    const app = express();
    app.use(express.json());
    app.use(cors(corsOptions));

    app.post("/replay", handleReplayRequest(tools, database));

    app.post("/runs", async (req, res) => {
      const { parameters } = req.body;
      const parameterizedMessages = messagesFromConfig.map(
        messageParameterizationFn(parameters),
      );
      const { runId } = await database.createRun();
      await database.insertMessages(
        runId,
        parameterizedMessages.map(messageToDbMessageFn),
      );
      const replayCallback = await replayCallbackFactory({ database, runId });
      await database.updateRunStatus(runId, "running");
      const run = await database.getRun(runId);
      res.json(run);
      const result = await agentInvoke({
        messages: parameterizedMessages,
        replayCallback,
      });
      await database.updateRunStatus(runId, "done");
      if (
        result &&
        typeof result === "object" &&
        "status" in result &&
        typeof result.status === "string"
      ) {
        await database.updateRunTaskStatus(runId, result.status);
      }
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
        res.status(500).json({
          error: "Failed to fetch runs",
          details:
            error && typeof error === "object" && "message" in error
              ? error.message
              : "Unknown error",
        });
      }
    });

    app.get("/runs/:runId", async (req, res) => {
      try {
        const { runId } = req.params;
        const run = await database.getRun(runId);
        res.json(run);
      } catch (error) {
        console.error(error);
        res.status(500).json({
          error: "Failed to fetch run",
          details:
            error && typeof error === "object" && "message" in error
              ? error.message
              : "Unknown error",
        });
      }
    });

    app.get("/runs/:runId/messages", async (req, res) => {
      try {
        const { runId } = req.params;
        const messages = await database.getAllMessages(runId);
        res.json(messages);
      } catch (error) {
        res.status(500).json({
          error: "Failed to fetch messages",
          details:
            error && typeof error === "object" && "message" in error
              ? error.message
              : "Unknown error",
        });
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
        res.status(500).json({
          error: "Failed to fetch message",
          details:
            error && typeof error === "object" && "message" in error
              ? error.message
              : "Unknown error",
        });
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
      const message = await database.getMessage(runId, messageId);

      if (!message.toolCalls) {
        res
          .status(400)
          .json({ error: "No tools to execute", details: message });
        return;
      }

      const results = await executeTools(message.toolCalls, tools);
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
