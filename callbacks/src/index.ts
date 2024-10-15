import { Database, DbMessage, messageType } from "../../database/index.js";

export function toType(message: { _getType(): string }) {
  const type = message._getType();
  type;
  debugger;
  return messageType.humanMessage;
}

export function toDbMessage(message: {
  _getType(): string;
  content: string;
  tool_calls?: string;
}): Omit<DbMessage, "id" | "run_id"> {
  return {
    type: toType(message),
    content: JSON.stringify(message.content),
    tool_calls:
      "tool_calls" in message && message.tool_calls
        ? JSON.stringify(message.tool_calls)
        : "",
    timestamp: Date.now(),
  };
}

export async function replayCallback(config: { database: Database }) {
  const { database } = config;
  const { runId } = await database.createRun();
  return {
    handleChainEnd: async (outputs: Record<string, any>) => {
      if (!("messages" in outputs)) return;
      await database.insertMessages(runId, outputs.messages);
    },
  };
}
