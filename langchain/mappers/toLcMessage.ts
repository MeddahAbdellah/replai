import {
  BaseMessage,
  HumanMessage,
  AIMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { Message, messageType } from "../../database/index.js";

export function toLcMessage(
  message: Omit<Message, "id" | "runId">,
): BaseMessage {
  if (message.type === messageType.humanMessage) {
    return new HumanMessage({ content: message.content || "" });
  }

  if (message.type === messageType.aiMessage) {
    return new AIMessage({
      content: message.content || "",
      tool_calls: message.toolCalls || [],
    });
  }

  return new ToolMessage({
    content: message.content || "",
    tool_call_id: message.toolCallId || "",
  });
}
