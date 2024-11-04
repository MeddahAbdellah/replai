import { Runner } from "../../runner/index.js";

export async function simpleSpawner(config: { runner: Runner }) {
  const { runner } = config;
  await runner();
}
