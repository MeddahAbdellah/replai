import {
  BaseMessage,
  ToolMessage,
  HumanMessage,
} from "@langchain/core/messages";
import { DbMessage, Message, messageType } from "../model/index.js";

export function toType(message: BaseMessage) {
  if (message instanceof ToolMessage) {
    return messageType.toolMessage;
  }

  if (message instanceof HumanMessage) {
    return messageType.humanMessage;
  }

  return messageType.aiMessage;
}

export function toMessage(message: DbMessage): Message {
  return {
    runId: message.run_id.toString(),
    type: message.type,
    content:
      typeof message.content === "string"
        ? message.content
        : "type" in JSON.parse(message.content)
          ? JSON.parse(message.content).type === "text"
            ? { type: "text", text: JSON.parse(message.content).text }
            : {
                type: "image_url",
                image_url: { url: JSON.parse(message.content).image_url.url },
              }
          : message.content,
    ...(message.tool_call &&
    JSON.parse(message.tool_call) instanceof Array &&
    JSON.parse(message.tool_call).length > 0
      ? {
          tool_calls: JSON.parse(message.tool_call).map(
            (toolCall: NonNullable<Message["tool_calls"]>[0]) => ({
              name: toolCall.name,
              ...(toolCall.args.input !== undefined
                ? {
                    args: {
                      input: toolCall.args.input || "",
                    },
                  }
                : {}),
            }),
          ),
        }
      : {}),
  };
}
