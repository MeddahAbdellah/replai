import {
  Message,
  messageType,
  ReadonlyDatabase,
} from "../../database/index.js";
import { toolsWithContext, ToolNotFoundError } from "../../tools/index.js";
import express from "express";
import { z } from "zod";
import cors from "cors";
import { Runner } from "../model/index.js";
import {
  toLcMessage,
  lcToMessage,
  lcHumanMessageToParameterizedMessage,
} from "../../langchain/index.js";

export function httpRunner<R = unknown, M = unknown>(config: {
  port: number;
  corsOptions?: cors.CorsOptions;
  toParameterized?: (parameters: Record<string, string>) => (message: M) => M;
  toMessage?: (message: M) => Omit<Message, "id" | "runId">;
  toAgentMessage?: (message: Omit<Message, "id" | "runId">) => M;
}): Runner<R, M> {
  const {
    port,
    corsOptions = { origin: "*" },
    toParameterized = lcHumanMessageToParameterizedMessage,
    toMessage = lcToMessage,
    toAgentMessage = toLcMessage,
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
      const { parameters, replayMessages, toolsOnly, includeConfigMessages } =
        req.body;
      // TODO: if replayMessages are not provided, includeConfigMessages must be true, add zod for that
      const parameterizedConfigMessages = messagesFromConfig
        .map(toParameterized(parameters))
        .map(toMessage);
      const configMessages = includeConfigMessages
        ? parameterizedConfigMessages
        : [];
      const messages: Omit<Message, "id" | "runId">[] = replayMessages
        ? [
            ...configMessages,
            ...(replayMessages as Omit<Message, "id" | "runId">[]),
          ]
        : configMessages;
      const { runId } = await database.createRun();
      debugger;
      await database.insertMessages(runId, messages);
      await database.updateRunStatus(runId, "running");
      const run = await database.getRun(runId);
      res.json(run);

      const messagesWithToolCalls = messages.filter(
        (message) => message.toolCalls && message.toolCalls.length > 0,
      );

      try {
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
      } catch (error) {
        console.error(error);
        await database.updateRunStatus(runId, "failed");
        await database.updateRunTaskStatus(runId, "failed");
      }
    });

    app.get("/health-check", (_req, res) => {
      res.json({ status: "ok" });
    });

    app.get("/runs", async (req, res) => {
      try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const offset = (page - 1) * limit;
        const order = (req.query.order as string) === "asc" ? "asc" : "desc";
        const filters: { status?: string; task_status?: string } = {
          ...(req.query.status ? { status: req.query.status as string } : {}),
          ...(req.query.taskStatus
            ? { task_status: req.query.taskStatus as string }
            : {}),
        };

        const [runs, totalCount] = await Promise.all([
          database.getRuns(limit, offset, order, filters),
          database.getRunsCount(filters),
        ]);

        const totalPages = Math.ceil(totalCount / limit);

        res.json({
          runs,
          pagination: {
            currentPage: page,
            totalPages,
            totalCount,
            limit,
          },
        });
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
