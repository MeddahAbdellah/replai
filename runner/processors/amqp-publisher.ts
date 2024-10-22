import amqp, { Message } from "amqplib";

export async function amqpPublisher(config: {
  amqpUrl: string;
  queue: string;
}): Promise<
  (message: {
    runId: string;
    messages: Omit<Message, "id" | "runId">[];
    toolsOnly: boolean;
  }) => Promise<void>
> {
  const { amqpUrl, queue } = config;
  const connection = await amqp.connect(amqpUrl);
  const channel = await connection.createChannel();

  await channel.assertQueue(queue, { durable: true });

  const publishMessage = async (message: {
    runId: string;
    messages: Omit<Message, "id" | "runId">[];
    toolsOnly: boolean;
  }) => {
    const messageBuffer = Buffer.from(JSON.stringify(message));
    channel.sendToQueue(queue, messageBuffer);
  };

  return publishMessage;
}
