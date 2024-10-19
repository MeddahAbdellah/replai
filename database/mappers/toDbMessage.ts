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
  message: Omit<Message, "id">,
): Omit<DbMessage, "id"> {
  return {
    run_id: message.runId,
    content:
      typeof message.content === "string"
        ? message.content
        : message.content
          ? JSON.stringify(message.content)
          : null,
    tool_calls: message.toolCalls ? JSON.stringify(message.toolCalls) : null,
    // TODO: rethink the default type
    type: isMessageType(message.type) ? message.type : "AiMessage",
    timestamp: message.timestamp,
  };
}
