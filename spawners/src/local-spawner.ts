import { Runner } from "../../runner/index.js";

export async function localSpawner(config: { runner: Runner }) {
  const { runner } = config;
  await runner();
}
