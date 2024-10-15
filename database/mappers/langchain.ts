import { DbMessage, messageType } from "../model/index.js";

function toType(message: { _getType(): string }) {
  const type = message._getType();
  if (type === "human") {
    return messageType.humanMessage;
  }
  if (type === "ai") {
    return messageType.aiMessage;
  }
  if (type === "tool") {
    return messageType.toolMessage;
  }
  return messageType.aiMessage;
}

export function langChainToDbMessage(message: {
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
