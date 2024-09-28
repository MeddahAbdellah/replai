import { tool } from "@langchain/core/tools";
import z from "zod";

export interface ToolContext<T> {
  getContext: () => T;
  setContext: (newStorage: T) => void;
  updateContext: (storageUpdate: Partial<T>) => void;
}

const createContext = <T>(): ToolContext<T> => {
  let storage: T;
  return {
    getContext: () => storage,
    setContext: (newStorage: T) => {
      storage = newStorage;
    },
    updateContext: (storageUpdate: Partial<T>) => {
      storage = {
        ...storage,
        ...storageUpdate,
      };
    },
  };
};

export interface ToolDefinition<F = Function> {
  func: F;
  fields: Parameters<typeof tool>[1];
}

export function toolsWithContext<T>(tools: ToolDefinition[]) {
  const storage = createContext<T>();
  return tools.map((newTool) =>
    tool<z.ZodString | z.AnyZodObject | Record<string, any>>(
      newTool.func.bind(null, storage),
      newTool.fields,
    ),
    // TODO: Fix the type of the tool function
  ) as any;
}
