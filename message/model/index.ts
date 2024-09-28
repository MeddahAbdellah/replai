import z from "zod";

export const messageType = {
  humanMessage: "HumanMessage",
  toolMessage: "ToolMessage",
  aiMessage: "AiMessage",
} as const;

export type MessageType = (typeof messageType)[keyof typeof messageType];

export interface DbMessage {
  id: number;
  run_id: number;
  type: MessageType;
  content: string;
  tool_call: string;
  timestamp: number;
}

export const messageSchema = z.object({
  runId: z.string(),
  type: z.enum(Object.values(messageType) as [string, ...string[]]),
  content: z.union([
    z.string(),
    z.object({ type: z.literal("text"), text: z.string() }),
    z.object({
      type: z.literal("image_url"),
      image_url: z.object({ url: z.string() }),
    }),
  ]),
  tool_calls: z
    .array(
      z.object({
        name: z.string(),
        args: z.object({ input: z.union([z.string(), z.record(z.unknown())]) }),
      }),
    )
    .optional(),
  timestamp: z.number(),
});

export type Message = z.infer<typeof messageSchema>;

export const MessagesArraySchema = z.array(messageSchema);
