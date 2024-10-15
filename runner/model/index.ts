import { Database } from "../../database/index.js";
import { toolsWithContext } from "../../tools/index.js";

import z from "zod";
import { messageType } from "../../database/index.js";

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

export interface AgentInvokeParams<M> {
  messages: M[];
  replayCallback: unknown;
}

export type Runner<R, M> = (params: {
  tools: ReturnType<typeof toolsWithContext>;
  database: Database;
  agentInvoke: (params: AgentInvokeParams<M>) => Promise<R>;
  messages: M[];
  replayCallbackFactory: (config: {
    database: Database;
    runId: string;
  }) => Promise<unknown>;
}) => Promise<void>;
