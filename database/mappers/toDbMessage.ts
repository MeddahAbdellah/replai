import {
  DbMessage,
  Message,
  MessageType,
  messageType,
} from "../model/index.js";

function isMessageType(type: string): type is MessageType {
  return Object.values(messageType).includes(type as MessageType);
}

export function toDbMessage(
  message: Omit<Message, "id" | "timestamp">,
): Omit<DbMessage, "id" | "timestamp"> {
  return {
    run_id: message.runId,
    content:
      typeof message.content === "string"
        ? message.content
        : message.content
          ? JSON.stringify(message.content)
          : null,
    tool_calls: message.toolCalls ? JSON.stringify(message.toolCalls) : null,
    tool_call_id: message.toolCallId || null,
    // TODO: rethink the default type
    type: isMessageType(message.type) ? message.type : "AiMessage",
  };
}
