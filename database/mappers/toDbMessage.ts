import {
  DbMessage,
  Message,
  MessageType,
  messageType,
} from "../model/index.js";

function isMessageType(type: string): type is MessageType {
  return Object.values(messageType).includes(type as MessageType);
}

export function toDbMessage(message: Message): Omit<DbMessage, "id"> {
  return {
    run_id: message.runId,
    content: JSON.stringify(message.content),
    tool_calls: message.toolCalls ? JSON.stringify(message.toolCalls) : null,
    // TODO: rethink the default type
    type: isMessageType(message.type) ? message.type : "AiMessage",
    timestamp: message.timestamp,
  };
}
