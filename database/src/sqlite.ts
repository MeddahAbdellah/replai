import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { Database, DatabaseConfig, DbMessage } from "../model/index.js";

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
      status TEXT NOT NULL,
      task_status TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL,
      type TEXT,
      content TEXT,
      tool_calls TEXT,
      timestamp INTEGER,
      FOREIGN KEY (run_id) REFERENCES runs(id)
    )
  `);

  return {
    getAllRuns: async () => {
      return db.all("SELECT * FROM runs");
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
    createRun: async () => {
      const run = await db.run(
        "INSERT INTO runs (status, task_status, timestamp) VALUES (?, ?, ?)",
        "scheduled",
        "unknown",
        Date.now(),
      );
      if (!run.lastID) {
        throw new Error("Failed to create run");
      }
      return { runId: run.lastID.toString() };
    },
    insertMessages: async (
      runId: string,
      messages: Omit<DbMessage, "run_id" | "id">[],
    ): Promise<void> => {
      try {
        await db.run("BEGIN TRANSACTION");

        const stmt = await db.prepare(
          "INSERT INTO messages (run_id, type, content, tool_calls, timestamp) VALUES (?, ?, ?, ?, ?)",
        );
        for (const message of messages) {
          await stmt.run(
            runId,
            message.type,
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
