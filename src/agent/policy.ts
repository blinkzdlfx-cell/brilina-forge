import type { ForgeTool, ToolExecutionContext, ToolPolicy } from "./types.js";
export function evaluateToolPolicy(tool: ForgeTool, _context: ToolExecutionContext): ToolPolicy { return tool.policy; }
export async function authorizeTool(tool: ForgeTool, context: ToolExecutionContext, args: unknown): Promise<boolean> {
  if (evaluateToolPolicy(tool, context) !== "allowed") return false;
  return tool.authorize(context, args);
}
