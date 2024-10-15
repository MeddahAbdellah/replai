import pupa from "pupa";

export function LangChainHumanMessageToParameterizedMessage<M>(
  parameters: Record<string, string>,
): (message: M) => M & { _getType(): string; content: string } {
  return (message: M) => {
    if (!message) {
      return message;
    }

    if (
      typeof message !== "object" ||
      !("_getType" in message) ||
      typeof message._getType !== "function"
    ) {
      return message;
    }

    const type = message._getType();

    if (type !== "human") {
      return message;
    }
    if (
      !("content" in message) ||
      !message.content ||
      typeof message.content !== "string"
    ) {
      return message;
    }
    return Object.assign(Object.create(message), {
      content: pupa(message.content, parameters),
    });
  };
}
