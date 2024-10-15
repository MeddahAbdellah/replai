import { DbMessage } from "../../database/index.js";
import { Message } from "../model/index.js";

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
    ...(message.tool_calls &&
    JSON.parse(message.tool_calls) instanceof Array &&
    JSON.parse(message.tool_calls).length > 0
      ? {
          tool_calls: JSON.parse(message.tool_calls).map(
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
    timestamp: message.timestamp,
  };
}
