import { DbMessage } from "../index.js";
import { Message } from "../model/index.js";

export function toMessage(message: DbMessage): Message {
  return {
    runId: message.run_id.toString(),
    type: message.type,
    content:
      typeof message.content === "string"
        ? message.content
        : message.content !== null
          ? JSON.parse(message.content)
          : null,
    toolCalls:
      message.tool_calls &&
      JSON.parse(message.tool_calls) instanceof Array &&
      JSON.parse(message.tool_calls).length > 0
        ? JSON.parse(message.tool_calls).map(
            (toolCall: NonNullable<Message["toolCalls"]>[0]) => ({
              name: toolCall.name,
              ...(toolCall.args.input !== undefined
                ? {
                    args: {
                      input: toolCall.args.input || "",
                    },
                  }
                : {}),
            }),
          )
        : null,
    timestamp: message.timestamp,
  };
}
