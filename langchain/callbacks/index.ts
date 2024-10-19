import { Database } from "../../database/index.js";
import { lcToMessage } from "../mappers/toMessage.js";

export async function lcReplayCallbackFactory(config: {
  database: Database;
  runId: string;
}) {
  const { database, runId } = config;
  return {
    handleChainEnd: async (outputs: Record<string, any>) => {
      if (!("messages" in outputs)) return;
      const messages = outputs.messages.map(lcToMessage);
      await database.insertMessages(runId, messages);
    },
  };
}
