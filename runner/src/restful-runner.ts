import { Message } from "../../database/index.js";
import express from "express";
import cors from "cors";
import { Runner } from "../model/index.js";
import {
  toLcMessage,
  lcToMessage,
  lcHumanMessageToParameterizedMessage,
} from "../../langchain/index.js";
import { processRun } from "../routines/run.js";
import { Logger } from "../../logger/model/index.js";

export function restfulRunner<R = unknown, M = unknown>(config: {
  port: number;
  corsOptions?: cors.CorsOptions;
  processor?: (params: {
    runId: string;
    messages: Omit<Message, "id" | "runId">[];
    toolsOnly: boolean;
  }) => Promise<void>;
  toParameterized?: (parameters: Record<string, string>) => (message: M) => M;
  toMessage?: (message: M) => Omit<Message, "id" | "runId">;
  toAgentMessage?: (message: Omit<Message, "id" | "runId">) => M;
  logger?: Logger;
}): Runner<R, M> {
  const {
    port,
    corsOptions = { origin: "*" },
    toParameterized = lcHumanMessageToParameterizedMessage,
    toMessage = lcToMessage,
    toAgentMessage = toLcMessage as (
      message: Omit<Message, "id" | "runId">,
    ) => M,
    logger,
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
    app.use(express.json({ limit: "10mb" }));
    app.use(cors(corsOptions));

    app.post("/runs", async (req, res) => {
      const { parameters, replayMessages, toolsOnly, includeConfigMessages } =
        req.body as {
          parameters: Record<string, string>;
          replayMessages: Omit<Message, "id" | "runId">[];
          toolsOnly: boolean;
          includeConfigMessages: boolean;
        };
      logger?.info("Received POST /runs request", req.body);
      const parameterizedConfigMessages = (messagesFromConfig || [])
        .map(toParameterized(parameters))
        .flatMap(toMessage);
      const configMessages = includeConfigMessages
        ? parameterizedConfigMessages
        : [];
      const messages: Omit<Message, "id" | "runId">[] = replayMessages
        ? [
            ...configMessages,
            ...(replayMessages as Omit<Message, "id" | "runId">[]),
          ]
        : configMessages;
      logger?.info("Preparing messages for a run ", messages);
      const { runId } = await database.createRun();
      await database.insertMessages(runId, messages);
      const run = await database.getRun(runId);
      logger?.info("Run created", run.id);
      res.json(run);

      try {
        if (config.processor) {
          await config.processor({ runId, messages, toolsOnly });
          logger?.info("Run processed by the processor", run.id);
        } else {
          logger?.info("Processing run internally", run.id);
          await processRun<M, R>({
            runId,
            messages,
            toolsOnly,
            database,
            tools,
            agentInvoke,
            toAgentMessage,
            replayCallbackFactory,
          });
        }
      } catch (error) {
        console.error(error);
        await database.updateRunStatus(runId, "failed");
        await database.updateRunTaskStatus(runId, "failed", "Processing error");
      }
    });

    app.post("/runs/batch", async (req, res) => {
      const { parameters, toolsOnly } = req.body as {
        parameters: Record<string, string>[];
        toolsOnly: boolean;
      };

      logger?.info("Received POST /runs/batch request", req.body);

      const messagesBatches = parameters.map(
        (parameters) =>
          messagesFromConfig
            ?.map(toParameterized(parameters))
            .flatMap(toMessage) || [],
      );

      logger?.info("Preparing messages for a batch run ", messagesBatches);
      const createdRunsIds = await Promise.all(
        messagesBatches.map(async (messages) => {
          const { runId } = await database.createRun();
          await database.insertMessages(runId, messages);
          return runId;
        }),
      );

      logger?.info("Runs created", createdRunsIds);
      res.json(createdRunsIds);

      if (config.processor) {
        for (const [index, messages] of messagesBatches.entries()) {
          const runId = createdRunsIds[index];
          try {
            await config.processor({
              runId,
              messages,
              toolsOnly,
            });
            logger?.info("Run processed by the processor", runId);
          } catch (error) {
            console.error(error);
            await database.updateRunStatus(runId, "failed");
            await database.updateRunTaskStatus(
              runId,
              "failed",
              "Processing error",
            );
          }
        }
      } else {
        for (const [index, messages] of messagesBatches.entries()) {
          const runId = createdRunsIds[index];
          try {
            await processRun<M, R>({
              runId,
              messages,
              toolsOnly,
              database,
              tools,
              agentInvoke,
              toAgentMessage,
              replayCallbackFactory,
            });
            logger?.info("Run processed internally", runId);
          } catch (error) {
            console.error(error);
            await database.updateRunStatus(runId, "failed");
            await database.updateRunTaskStatus(
              runId,
              "failed",
              "Processing error",
            );
          }
        }
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
      logger?.info(`LangReplay runner listening on port ${port}`);
    });
  };
}
