import amqp from "amqplib";
import {
  AgentInvokeFactoryConfig,
  AgentInvokeFn,
  Runner,
  RunnerConfig,
} from "../model/index.js";
import { lcReplayCallbackFactory, toLcMessage } from "../../langchain/index.js";
import { Message } from "../../database/index.js";
import { processRun } from "../routines/run.js";
import { Logger } from "../../logger/model/index.js";

interface AmqpRunnerConfig<
  AgentInvokeFactory extends (
    config: AgentInvokeFactoryConfig,
  ) => Promise<AgentInvokeFn<R, M>>,
  R,
  M,
> extends Omit<RunnerConfig<AgentInvokeFactory, M>, "messages"> {
  amqpUrl: string;
  queue: string;
  toAgentMessage?: (message: Omit<Message, "id" | "runId">) => M;
  logger?: Logger;
}

export function amqpRunner<
  AgentInvokeFactory extends (
    config: AgentInvokeFactoryConfig,
  ) => Promise<AgentInvokeFn<R, M>>,
  R = unknown,
  M = unknown,
>(config: AmqpRunnerConfig<AgentInvokeFactory, R, M>): Runner {
  const {
    amqpUrl,
    queue,
    toAgentMessage = toLcMessage as (
      message: Omit<Message, "id" | "runId">,
    ) => M,
    logger,
    tools,
    database,
    agentInvokeFactory,
    replayCallbackFactory = lcReplayCallbackFactory,
  } = config;

  return async () => {
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
            await processRun<AgentInvokeFactory, R, M>({
              runId,
              messages,
              toolsOnly,
              database,
              tools,
              agentInvokeFactory,
              toAgentMessage,
              replayCallbackFactory,
            });
            logger?.info("Run processed successfully ", runId);
          } catch (error) {
            logger?.error(error as Error);
            await database.updateRunStatus(runId, "failed");
            await database.updateRunTaskStatus(
              runId,
              "failed",
              "Processing failed",
            );
          }

          channel.ack(msg);
        }
      });
    } catch (error) {
      logger?.error(error as Error);
    }
  };
}
