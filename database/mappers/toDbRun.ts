import { DbRun, Run } from "../model/index.js";

export function toDbRun(run: Run): DbRun {
  return { ...run };
}
