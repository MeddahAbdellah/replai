import { Message, messageType } from "../model/index.js";

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
  content: any;
  tool_calls?: any;
}): Omit<Message, "runId"> {
  return {
    type: toType(message),
    content: message.content,
    toolCalls:
      "tool_calls" in message && message.tool_calls
        ? message.tool_calls.map((toolCall: any) => ({
            name: toolCall.name as string,
            args: toolCall.args as { input: Record<string, any> },
          }))
        : null,
    timestamp: Date.now(),
  };
}
