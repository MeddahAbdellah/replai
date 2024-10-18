import { Database, Message } from "../../database/index.js";
import { langChainToDbMessage } from "../../database/mappers/langchain.js";

export async function langChainReplayCallbackFactory(config: {
  database: Database;
  runId: string;
}) {
  const { database, runId } = config;
  return {
    handleChainEnd: async (outputs: Record<string, any>) => {
      if (!("messages" in outputs)) return;
      const messages = outputs.messages.map(langChainToDbMessage);
      await database.insertMessages(runId, messages);
    },
  };
}
