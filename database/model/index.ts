import { BaseMessage } from "@langchain/core/messages";
import { DbMessage } from "../../message/index.js";
import sqlite3 from "sqlite3";

export interface ReadonlyDatabase {
  getAllRuns: (agentName: string) => Promise<DbMessage[]>;
  getAllMessages: (runId: string) => Promise<DbMessage[]>;
}

export interface DatabaseConfig {
  filename: string;
  driver: keyof typeof sqlite3;
}

export interface Database extends ReadonlyDatabase {
  createRun: (agentName: string) => Promise<{ runId: string }>;
  insertMessages: (runId: string, messages: BaseMessage[]) => Promise<void>;
}
