import amqp from "amqplib";
import { Runner } from "../model/index.js";
import { toLcMessage } from "../../langchain/index.js";
import { Message } from "../../database/index.js";
import { processRun } from "../routines/run.js";
import { Logger } from "../../logger/model/index.js";

export function amqpRunner<R = unknown, M = unknown>(config: {
  amqpUrl: string;
  queue: string;
  toAgentMessage?: (message: Omit<Message, "id" | "runId">) => M;
  logger?: Logger;
}): Runner<R, M> {
  const {
    amqpUrl,
    queue,
    toAgentMessage = toLcMessage as (
      message: Omit<Message, "id" | "runId">,
    ) => M,
    logger,
  } = config;

  return async (params) => {
    const { tools, database, agentInvoke, replayCallbackFactory } = params;

    try {
      const connection = await amqp.connect(amqpUrl);
      const channel = await connection.createChannel();
      await channel.assertQueue(queue, { durable: true });

      logger?.info(`Waiting for messages in ${queue}. To exit press CTRL+C`);

      channel.consume(queue, async (msg) => {
        if (msg !== null) {
          const content = JSON.parse(msg.content.toString());
          logger?.info("Processing message", content);
          const { runId, messages, toolsOnly } = content as {
            runId: string;
            messages: Omit<Message, "id" | "runId">[];
            toolsOnly: boolean;
          };
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
            logger?.info("Run processed successfully ", runId);
          } catch (error) {
            logger?.error(error as Error);
            await database.updateRunStatus(runId, "failed");
            await database.updateRunTaskStatus(runId, "failed");
          }

          channel.ack(msg);
        }
      });
    } catch (error) {
      logger?.error(error as Error);
    }
  };
}
