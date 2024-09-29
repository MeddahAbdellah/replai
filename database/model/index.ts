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
  tool_call: string;
  timestamp: number;
}

export interface DbAgent {
  id: number;
  name: string;
}

export interface DbRun {
  id: number;
  agent_id: number;
}

export interface ReadonlyDatabase {
  getAllAgents: () => Promise<DbAgent[]>;
  getAllRuns: (agentId: string) => Promise<DbRun[]>;
  getAllMessages: (runId: string) => Promise<DbMessage[]>;
  getMessage: (runId: string, messageId: string) => Promise<DbMessage>;
}

export interface DatabaseConfig {
  filename: string;
  driver: keyof typeof sqlite3;
}

export interface Database extends ReadonlyDatabase {
  createRun: (agentId: string) => Promise<{ runId: string }>;
  getOrCreateAgent: (agentName: string) => Promise<{ agentId: string }>;
  insertMessages: (runId: string, messages: BaseMessage[]) => Promise<void>;
}
