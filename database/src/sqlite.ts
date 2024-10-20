import sqlite3 from "sqlite3";
import { open } from "sqlite";
import {
  Database,
  DatabaseConfig,
  DbMessage,
  DbRun,
  Message,
  messageSchema,
} from "../model/index.js";
import { toMessage } from "../mappers/toMessage.js";
import { toRun } from "../mappers/toRun.js";
import { toDbMessage } from "../mappers/toDbMessage.js";

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
      type TEXT NOT NULL,
      content TEXT,
      tool_calls TEXT,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (run_id) REFERENCES runs(id)
    )
  `);

  return {
    getRuns: async (
      limit: number,
      offset: number,
      order: "asc" | "desc" = "desc",
      filters?: { status?: string; task_status?: string },
    ) => {
      let query = "SELECT * FROM runs";
      const params: (number | string)[] = [];

      if (filters) {
        const whereConditions: string[] = [];
        if (filters.status) {
          whereConditions.push("status = ?");
          params.push(filters.status);
        }
        if (filters.task_status) {
          whereConditions.push("task_status = ?");
          params.push(filters.task_status);
        }
        if (whereConditions.length > 0) {
          query += " WHERE " + whereConditions.join(" AND ");
        }
      }

      query += ` ORDER BY timestamp ${order === "asc" ? "ASC" : "DESC"} LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      return db.all(query, ...params).then((runs: DbRun[]) => runs.map(toRun));
    },
    getRunsCount: async (filters?: {
      status?: string;
      task_status?: string;
    }) => {
      let query = "SELECT COUNT(*) as count FROM runs";
      const params: string[] = [];

      if (filters) {
        const whereConditions: string[] = [];
        if (filters.status) {
          whereConditions.push("status = ?");
          params.push(filters.status);
        }
        if (filters.task_status) {
          whereConditions.push("task_status = ?");
          params.push(filters.task_status);
        }
        if (whereConditions.length > 0) {
          query += " WHERE " + whereConditions.join(" AND ");
        }
      }

      const count = (await db.get(query, ...params)) as { count: number };
      return count.count;
    },
    getRun: async (runId: string) => {
      const run = (await db.get(
        "SELECT * FROM runs WHERE id = ?",
        runId,
      )) as DbRun;
      if (!run) {
        throw new Error("Run not found");
      }
      return toRun(run);
    },
    getAllMessages: async (runId: string) =>
      db
        .all(
          "SELECT * FROM messages WHERE run_id = ? ORDER BY timestamp ASC",
          runId,
        )
        .then((messages: DbMessage[]) => messages.map(toMessage)),
    getMessage: async (runId: string, messageId: string) => {
      const message = (await db.get(
        "SELECT * FROM messages WHERE run_id = ? AND id = ?",
        runId,
        messageId,
      )) as DbMessage;
      if (!message) {
        throw new Error("Message not found");
      }
      return toMessage(message);
    },
    createRun: async () => {
      const runInsert = await db.run(
        "INSERT INTO runs (status, task_status, timestamp) VALUES (?, ?, ?)",
        "scheduled",
        "unknown",
        Date.now(),
      );
      if (!runInsert.lastID) {
        throw new Error("Failed to create run");
      }
      return { runId: runInsert.lastID.toString() };
    },
    updateRunStatus: async (runId, status) => {
      const run = (await db.get(
        "SELECT * FROM runs WHERE id = ?",
        runId,
      )) as DbRun;
      if (!run) {
        throw new Error("Run not found");
      }
      await db.run("UPDATE runs SET status = ? WHERE id = ?", status, runId);
      return toRun({ ...run, status } as DbRun);
    },
    updateRunTaskStatus: async (runId, taskStatus) => {
      const run = (await db.get(
        "SELECT * FROM runs WHERE id = ?",
        runId,
      )) as DbRun;
      if (!run) {
        throw new Error("Run not found");
      }
      await db.run(
        "UPDATE runs SET task_status = ? WHERE id = ?",
        taskStatus,
        runId,
      );
      return toRun({ ...run, taskStatus } as DbRun);
    },
    insertMessages: async (
      runId: string,
      messages: Omit<Message, "id" | "runId">[],
    ): Promise<{ messageIds: string[] }> => {
      const validatedMessages = messages
        .map((message) => {
          const result = messageSchema
            .omit({ id: true })
            .safeParse({ runId, ...message });
          if (!result.success) {
            throw new Error(`Invalid message: ${result.error}`);
          }
          return result.data;
        })
        .map(toDbMessage);

      const messageIds: string[] = [];
      try {
        await db.run("BEGIN TRANSACTION");

        const stmt = await db.prepare(
          "INSERT INTO messages (run_id, type, content, tool_calls, timestamp) VALUES (?, ?, ?, ?, ?)",
        );
        for (const message of validatedMessages) {
          const result = await stmt.run(
            runId,
            message.type,
            message.content,
            "tool_calls" in message && message.tool_calls
              ? message.tool_calls
              : "",
            Date.now(),
          );
          if (result.lastID) {
            messageIds.push(result.lastID.toString());
          }
        }
        await stmt.finalize();
        await db.run("COMMIT");
        return { messageIds };
      } catch (error) {
        await db.run("ROLLBACK");
        throw error;
      }
    },
  };
}
