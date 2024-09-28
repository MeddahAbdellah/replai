import { ChainValues } from "@langchain/core/utils/types";
import { Database } from "../../database/index.js";

export async function replayCallback(config: {
  runName: string;
  database: Database;
}) {
  const { database, runName } = config;
  const { runId } = await database.createRun(runName);
  return {
    handleChainEnd: async (outputs: ChainValues) => {
      if (!("messages" in outputs)) return;
      await database.insertMessages(runId, outputs.messages);
      debugger;
    },
  };
}
