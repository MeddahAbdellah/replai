import pg from "pg";
import {
  Database,
  PostgresqlDatabaseConfig,
  DbMessage,
  DbRun,
  Message,
  messageSchema,
} from "../model/index.js";
import { toMessage } from "../mappers/toMessage.js";
import { toRun } from "../mappers/toRun.js";
import { toDbMessage } from "../mappers/toDbMessage.js";

export async function postgresql(
  config: Partial<PostgresqlDatabaseConfig>,
): Promise<Database> {
  const pool = new pg.Pool({
    connectionString: config.connectionString,
  });

  const client = await pool.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS runs (
      id SERIAL PRIMARY KEY,
      status TEXT NOT NULL,
      task_status TEXT NOT NULL,
      reason TEXT,
      timestamp BIGINT NOT NULL
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      run_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      content TEXT,
      tool_calls TEXT,
      tool_call_id TEXT,
      timestamp BIGINT NOT NULL,
      FOREIGN KEY (run_id) REFERENCES runs(id)
    )
  `);

  client.release();

  return {
    getRuns: async (
      limit: number,
      offset: number,
      order: "asc" | "desc" = "desc",
      filters?: { status?: string; task_status?: string },
    ) => {
      let query = "SELECT * FROM runs";
      const params = [];
      let paramIndex = 1; // Start index for parameter placeholders

      if (filters) {
        const whereConditions = [];
        if (filters.status) {
          whereConditions.push(`status = $${paramIndex}`);
          params.push(filters.status);
          paramIndex++;
        }
        if (filters.task_status) {
          whereConditions.push(`task_status = $${paramIndex}`);
          params.push(filters.task_status);
          paramIndex++;
        }
        if (whereConditions.length > 0) {
          query += " WHERE " + whereConditions.join(" AND ");
        }
      }
      query += ` ORDER BY timestamp ${order === "asc" ? "ASC" : "DESC"} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);

      const result = await pool.query(query, params);
      return result.rows.map(toRun);
    },
    getRunsCount: async (filters?: {
      status?: string;
      task_status?: string;
    }) => {
      let query = "SELECT COUNT(*) as count FROM runs";
      const params = [];
      let paramIndex = 1;

      if (filters) {
        const whereConditions = [];
        if (filters.status) {
          whereConditions.push(`status = $${paramIndex}`);
          params.push(filters.status);
          paramIndex++;
        }
        if (filters.task_status) {
          whereConditions.push(`task_status = $${paramIndex}`);
          params.push(filters.task_status);
          paramIndex++;
        }
        if (whereConditions.length > 0) {
          query += " WHERE " + whereConditions.join(" AND ");
        }
      }

      const result = await pool.query(query, params);
      return parseInt(result.rows[0].count, 10);
    },
    getRun: async (runId: string) => {
      const result = await pool.query("SELECT * FROM runs WHERE id = $1", [
        runId,
      ]);
      const run = result.rows[0] as DbRun;
      if (!run) {
        throw new Error("Run not found");
      }
      return toRun(run);
    },
    getAllMessages: async (runId: string) =>
      pool
        .query(
          "SELECT * FROM messages WHERE run_id = $1 ORDER BY timestamp ASC",
          [runId],
        )
        .then((result) => result.rows.map(toMessage)),
    getMessage: async (runId: string, messageId: string) => {
      const result = await pool.query(
        "SELECT * FROM messages WHERE run_id = $1 AND id = $2",
        [runId, messageId],
      );
      const message = result.rows[0] as DbMessage;
      if (!message) {
        throw new Error("Message not found");
      }
      return toMessage(message);
    },
    createRun: async () => {
      const result = await pool.query(
        "INSERT INTO runs (status, task_status, reason, timestamp) VALUES ($1, $2, $3, $4) RETURNING id",
        ["scheduled", "unknown", "", Date.now()],
      );
      const runId = result.rows[0].id;
      if (!runId) {
        throw new Error("Failed to create run");
      }
      return { runId: runId.toString() };
    },
    updateRunStatus: async (runId, status) => {
      const result = await pool.query(
        "UPDATE runs SET status = $1 WHERE id = $2 RETURNING *",
        [status, runId],
      );
      const run = result.rows[0] as DbRun;
      if (!run) {
        throw new Error("Run not found");
      }
      return toRun(run);
    },
    updateRunTaskStatus: async (runId, taskStatus, reason) => {
      const result = await pool.query(
        "UPDATE runs SET task_status = $1, reason = $2 WHERE id = $3 RETURNING *",
        [taskStatus, reason, runId],
      );
      const run = result.rows[0] as DbRun;
      if (!run) {
        throw new Error("Run not found");
      }
      return toRun(run);
    },
    insertMessages: async (
      runId: string,
      messages: Omit<Message, "id" | "runId">[],
    ): Promise<{ messageIds: string[] }> => {
      const validatedMessages = messages
        .map((message) => {
          const result = messageSchema
            .omit({ id: true, timestamp: true })
            .safeParse({ runId, ...message });
          if (!result.success) {
            throw new Error(`Invalid message: ${result.error}`);
          }
          return result.data;
        })
        .map(toDbMessage);

      const messageIds: string[] = [];
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        for (const message of validatedMessages) {
          const result = await client.query(
            "INSERT INTO messages (run_id, type, content, tool_calls, tool_call_id, timestamp) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
            [
              runId,
              message.type,
              message.content,
              "tool_calls" in message && message.tool_calls
                ? message.tool_calls
                : "",
              message.tool_call_id,
              Date.now(),
            ],
          );
          if (result.rows[0].id) {
            messageIds.push(result.rows[0].id.toString());
          }
        }
        await client.query("COMMIT");
        return { messageIds };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
