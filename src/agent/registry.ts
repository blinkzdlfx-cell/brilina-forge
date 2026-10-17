import type { ForgeTool } from "./types.js";
import {
  defaultEnabledGithubToolCategories,
  defaultEnabledGithubToolNames,
  filterAvailableGithubTools,
  type GithubToolCategory
} from "./tool-catalog.js";

export type ToolAvailabilityPreferences = {
  enabledNames: ReadonlySet<string>;
  enabledCategories: ReadonlySet<GithubToolCategory>;
};

export class ToolRegistry {
  private readonly tools = new Map<string, ForgeTool>();
  private availability: ToolAvailabilityPreferences = {
    enabledNames: defaultEnabledGithubToolNames(),
    enabledCategories: defaultEnabledGithubToolCategories()
  };

  register(tool: ForgeTool): void {
    if (!/^[a-z][a-z0-9_.-]+$/.test(tool.name)) throw new Error("Invalid tool name");
    if (this.tools.has(tool.name)) throw new Error("Tool already registered: " + tool.name);
    this.tools.set(tool.name, tool);
  }

  /**
   * Apply user preferences to tool discoverability. Preferences can only
   * disable catalogued tools that are enabled by the server's safe defaults;
   * they cannot enable a server-disabled capability or alter tool policy.
   */
  setAvailabilityPreferences(preferences: Partial<ToolAvailabilityPreferences>): void {
    this.availability = {
      enabledNames: preferences.enabledNames ?? this.availability.enabledNames,
      enabledCategories: preferences.enabledCategories ?? this.availability.enabledCategories
    };
  }

  isAvailable(name: string): boolean {
    const tool = this.tools.get(name);
    if (!tool) return false;
    return filterAvailableGithubTools([tool], this.availability.enabledNames, this.availability.enabledCategories).length > 0;
  }

  get(name: string): ForgeTool | undefined {
    if (!this.isAvailable(name)) return undefined;
    return this.tools.get(name);
  }

  list(): ForgeTool[] {
    return filterAvailableGithubTools(
      [...this.tools.values()],
      this.availability.enabledNames,
      this.availability.enabledCategories
    );
  }
}
