import { BaseMessage } from "@langchain/core/messages";
import sqlite3 from "sqlite3";

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
  tool_calls: string;
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
  id: number;
  status: RunStatus;
  taskStatus: string;
  timestamp: string;
}

export interface ReadonlyDatabase {
  getAllRuns: () => Promise<DbRun[]>;
  getRun: (runId: string) => Promise<DbRun>;
  getAllMessages: (runId: string) => Promise<DbMessage[]>;
  getMessage: (runId: string, messageId: string) => Promise<DbMessage>;
}

export interface DatabaseConfig {
  filename: string;
  driver: keyof typeof sqlite3;
}

export interface Database extends ReadonlyDatabase {
  createRun: () => Promise<{ runId: string }>;
  updateRunStatus: (runId: string, status: RunStatus) => Promise<DbRun>;
  updateRunTaskStatus: (runId: string, taskStatus: string) => Promise<DbRun>;
  insertMessages: (
    runId: string,
    messages: Omit<DbMessage, "run_id" | "id">[],
  ) => Promise<void>;
}
