import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { AIMessage, BaseMessage } from "@langchain/core/messages";
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
    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_name TEXT UNIQUE NOT NULL
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT,
      content TEXT,
      tool_call TEXT,
      timestamp INTEGER,
      FOREIGN KEY (run_id) REFERENCES runs(id)
    )
  `);

  return {
    getAllRuns: async (agentName: string) =>
      db.all("SELECT * FROM runs WHERE run_name = ?", agentName),
    getAllMessages: async (runId: string) =>
      db.all(
        "SELECT * FROM messages WHERE run_id = ? ORDER BY timestamp ASC",
        runId,
      ),
    createRun: async (runName: string) => {
      const run = await db.run(
        "INSERT INTO runs (run_name) VALUES (?, ?)",
        runName,
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
            message instanceof AIMessage
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
