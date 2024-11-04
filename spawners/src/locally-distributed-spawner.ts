import { Runner } from "../../runner/index.js";
import { exec } from "child_process";
import util from "util";

const execPromise = util.promisify(exec);

export async function locallyDistributedSpawner(config: {
  publisher: Runner;
  consumer: Runner;
}) {
  // Check if RabbitMQ is running, if not, start it
  try {
    await execPromise("docker inspect -f '{{.State.Running}}' rabbitmq");
  } catch {
    console.log("Starting RabbitMQ...");
    await execPromise("docker run -d --name rabbitmq -p 5672:5672 rabbitmq");
  }

  const connectionUrl = "amqp://localhost:5672";
  connectionUrl;
  // // Call the publisher and consumer functions with the connection URL
  // await config.publisher(connectionUrl);
  // await config.consumer(connectionUrl);
}
