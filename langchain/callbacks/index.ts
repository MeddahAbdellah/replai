import { Database } from "../../database/index.js";
import { lcToDbMessage } from "../mappers/toDbMessage.js";

export async function lcReplayCallbackFactory(config: {
  database: Database;
  runId: string;
}) {
  const { database, runId } = config;
  return {
    handleChainEnd: async (outputs: Record<string, any>) => {
      if (!("messages" in outputs)) return;
      const messages = outputs.messages.map(lcToDbMessage);
      await database.insertMessages(runId, messages);
    },
  };
}
