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

function turnToolMessageThatContainsImageIntoHumanMessage(
  message: Omit<Message, "id" | "runId">,
): Omit<Message, "id" | "runId">[] {
  if (
    message.type !== messageType.toolMessage ||
    !message.content ||
    !Array.isArray(message.content)
  ) {
    return [message];
  }
  if (!message.content) {
    return [message];
  }
  const imageContent = message.content.filter(
    (content) => content.type === "image_url",
  );
  const textContent = message.content.filter(
    (content) => content.type !== "image_url",
  );
  return [
    ...textContent.map((content) => ({
      ...message,
      content: content.text,
    })),
    ...imageContent.map((content) => ({
      ...message,
      type: messageType.humanMessage,
      content: [content],
    })),
  ];
}

export function lcToMessage(message: unknown): Omit<Message, "id" | "runId">[] {
  const type = toType((message as any)._getType());
  if (!type) {
    throw new Error(
      "Message is required, and must have a _getType method that returns it's type if you're using langchain tools",
    );
  }

  if (typeof message !== "object" || message === null) {
    throw new Error("Message must be an object");
  }

  return turnToolMessageThatContainsImageIntoHumanMessage({
    type,
    content: "content" in message ? (message.content as string) : null,
    toolCalls:
      "tool_calls" in message && Array.isArray(message.tool_calls)
        ? message.tool_calls.map((toolCall: any) => ({
            id: toolCall.id as string,
            name: toolCall.name as string,
            args: toolCall.args as { input: Record<string, any> },
            type: "tool_call",
          }))
        : null,
    toolCallId:
      "tool_call_id" in message ? (message.tool_call_id as string) : "",
    timestamp: Date.now(),
  });
}
