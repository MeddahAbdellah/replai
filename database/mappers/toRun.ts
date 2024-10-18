import { DbRun, Run } from "../model/index.js";

export function toRun(dbRun: DbRun): Run {
  return { ...dbRun };
}
