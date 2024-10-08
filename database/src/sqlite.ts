import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { BaseMessage } from "@langchain/core/messages";
import { toType } from "../../message/src/index.js";
import { Database, DatabaseConfig } from "../model/index.js";

export async function sqlite(
  config?: Partial<DatabaseConfig>,
): Promise<Database> {
  const db = await open({
    filename: config?.filename || "./.database/replay.db",
    driver: config?.driver || sqlite3.Database,
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL,
      type TEXT,
      content TEXT,
      tool_call TEXT,
      timestamp INTEGER,
      FOREIGN KEY (run_id) REFERENCES runs(id)
    )
  `);

  return {
    getAllRuns: async (agentId: string) => {
      const agent = await db.get("SELECT * FROM agents WHERE id = ?", agentId);
      if (!agent) {
        throw new Error("Agent not found");
      }
      return db.all("SELECT * FROM runs WHERE agent_id = ?", agent.id);
    },
    getAllMessages: async (runId: string) =>
      db.all(
        "SELECT * FROM messages WHERE run_id = ? ORDER BY timestamp ASC",
        runId,
      ),
    getMessage: async (runId: string, messageId: string) => {
      const message = await db.get(
        "SELECT * FROM messages WHERE run_id = ? AND id = ?",
        runId,
        messageId,
      );
      if (!message) {
        throw new Error("Message not found");
      }
      return message;
    },
    getOrCreateAgent: async (agentName: string) => {
      const agent = await db.get(
        "SELECT * FROM agents WHERE name = ?",
        agentName,
      );
      if (agent) {
        return { agentId: agent.id.toString() };
      }
      const newAgent = await db.run(
        "INSERT INTO agents (name) VALUES (?)",
        agentName,
      );
      if (!newAgent.lastID) {
        throw new Error("Failed to create agent");
      }
      return { agentId: newAgent.lastID };
    },
    createRun: async (agentId: string) => {
      const run = await db.run(
        "INSERT INTO runs (agent_id) VALUES (?)",
        agentId,
      );
      if (!run.lastID) {
        throw new Error("Failed to create run");
      }
      return { runId: run.lastID.toString() };
    },
    insertMessages: async (
      runId: string,
      messages: BaseMessage[],
    ): Promise<void> => {
      try {
        await db.run("BEGIN TRANSACTION");

        const stmt = await db.prepare(
          "INSERT INTO messages (run_id, type, content, tool_call, timestamp) VALUES (?, ?, ?, ?, ?)",
        );
        for (const message of messages) {
          await stmt.run(
            runId,
            toType(message),
            JSON.stringify(message.content),
            "tool_calls" in message && message.tool_calls
              ? JSON.stringify(message.tool_calls)
              : "",
            Date.now(),
          );
        }
        await stmt.finalize();
        await db.run("COMMIT");
      } catch (error) {
        await db.run("ROLLBACK");
        throw error;
      }
    },
  };
}
