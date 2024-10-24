import { DbMessage } from "../index.js";
import { Message } from "../model/index.js";

function parseOrReturn<T>(value: string): T | string {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function toMessage(message: DbMessage): Message {
  return {
    id: message.id,
    runId: message.run_id.toString(),
    type: message.type,
    content:
      message.content !== null
        ? parseOrReturn<Message["content"]>(message.content)
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
