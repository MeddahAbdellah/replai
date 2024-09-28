import { toolsWithContext } from "../../tools/index.js";
import {
  Database,
  DatabaseConfig,
  ReadonlyDatabase,
} from "../../database/index.js";

export interface Config {
  identifier: string;
  database: (config?: Partial<DatabaseConfig>) => Promise<Database>;
  spawner: (config: {
    tools: ReturnType<typeof toolsWithContext>;
    database: ReadonlyDatabase;
  }) => Promise<void>;
  tools: ReturnType<typeof toolsWithContext>;
}
