import { ChainValues } from "@langchain/core/utils/types";
import { Database } from "../../database/index.js";

export async function replayCallback(config: {
  agentName: string;
  database: Database;
}) {
  const { database, agentName } = config;
  const { agentId } = await database.getOrCreateAgent(agentName);
  const { runId } = await database.createRun(agentId);
  return {
    handleChainEnd: async (outputs: ChainValues) => {
      if (!("messages" in outputs)) return;
      await database.insertMessages(runId, outputs.messages);
    },
  };
}
