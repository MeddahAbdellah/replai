import { Message, messageType } from "../../database/model/index.js";

function toType(type: string) {
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

export function lcToDbMessage(message: unknown): Omit<Message, "runId"> {
  const type = toType((message as any)._getType());
  if (!type) {
    throw new Error(
      "Message is required, and must have a _getType method that returns it's type if you're using langchain tools",
    );
  }

  if (typeof message !== "object" || message === null) {
    throw new Error("Message must be an object");
  }

  return {
    type,
    content: "content" in message ? (message.content as string) : null,
    toolCalls:
      "tool_calls" in message && Array.isArray(message.tool_calls)
        ? message.tool_calls.map((toolCall: any) => ({
            name: toolCall.name as string,
            args: toolCall.args as { input: Record<string, any> },
          }))
        : null,
    timestamp: Date.now(),
  };
}
