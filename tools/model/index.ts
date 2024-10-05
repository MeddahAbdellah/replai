import { toolsWithContext } from "../src/tool-extension.js";

export class ToolNotFoundError extends Error {
  constructor(toolName: string, tools: ReturnType<typeof toolsWithContext>) {
    super(
      `Tool ${toolName} does not exist in the list of tools: ${tools.map((tool: any) => tool.name).join(", ")}`,
    );
  }
}
