import sqlite3 from "sqlite3";
import z from "zod";

export const messageType = {
  humanMessage: "HumanMessage",
  toolMessage: "ToolMessage",
  aiMessage: "AiMessage",
} as const;

export type MessageType = (typeof messageType)[keyof typeof messageType];

export interface DbMessage {
  id: string;
  run_id: string;
  type: MessageType;
  content: string | null;
  tool_calls: string | null;
  timestamp: number;
}

export const runStatus = {
  scheduled: "scheduled",
  running: "running",
  done: "done",
  failed: "failed",
} as const;

export type RunStatus = (typeof runStatus)[keyof typeof runStatus];

export interface DbRun {
  id: string;
  status: RunStatus;
  taskStatus: string;
  timestamp: string;
}

export interface Run {
  id: string;
  status: RunStatus;
  taskStatus: string;
  timestamp: string;
}

export const messageSchema = z.object({
  id: z.string(),
  runId: z.string(),
  type: z.enum(Object.values(messageType) as [string, ...string[]]),
  content: z.union([
    z.string(),
    z.array(
      z.union([
        z.object({ type: z.literal("text"), text: z.string() }),
        z.object({
          type: z.literal("image_url"),
          image_url: z.object({ url: z.string() }),
        }),
      ]),
    ),
    z.null(),
  ]),
  toolCalls: z.union([
    z.array(
      z.object({
        name: z.string(),
        args: z.object({
          input: z.union([z.string(), z.record(z.unknown())]),
        }),
      }),
    ),
    z.null(),
  ]),
  timestamp: z.number(),
});

export type Message = z.infer<typeof messageSchema>;

export interface ReadonlyDatabase {
  getRuns: (
    limit: number,
    offset: number,
    order: "asc" | "desc",
    filters?: { status?: string; task_status?: string },
  ) => Promise<Run[]>;
  getRunsCount: (filters?: {
    status?: string;
    task_status?: string;
  }) => Promise<number>;
  getRun: (runId: string) => Promise<Run>;
  getAllMessages: (runId: string) => Promise<Message[]>;
  getMessage: (runId: string, messageId: string) => Promise<Message>;
}

export interface Database extends ReadonlyDatabase {
  createRun: () => Promise<{ runId: string }>;
  updateRunStatus: (runId: string, status: RunStatus) => Promise<Run>;
  updateRunTaskStatus: (runId: string, taskStatus: string) => Promise<Run>;
  insertMessages: (
    runId: string,
    messages: Omit<Message, "id" | "runId">[],
  ) => Promise<{ messageIds: string[] }>;
}

export interface SqliteDatabaseConfig {
  filename: string;
  driver: keyof typeof sqlite3;
}

export interface PostgresqlDatabaseConfig {
  connectionString: string;
}
