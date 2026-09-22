import type { ForgeTool } from "./types.js";
export class ToolRegistry {
  private readonly tools = new Map<string, ForgeTool>();
  register(tool: ForgeTool): void {
    if (!/^[a-z][a-z0-9_.-]+$/.test(tool.name)) throw new Error("Invalid tool name");
    if (this.tools.has(tool.name)) throw new Error("Tool already registered: " + tool.name);
    this.tools.set(tool.name, tool);
  }
  get(name: string): ForgeTool | undefined { return this.tools.get(name); }
  list(): ForgeTool[] { return [...this.tools.values()]; }
}
