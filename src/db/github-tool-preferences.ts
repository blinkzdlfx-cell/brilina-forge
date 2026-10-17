import { getSql } from "./client.js";
import { defaultEnabledGithubToolCategories, defaultEnabledGithubToolNames, listGithubToolDefinitions, type GithubToolCategory } from "../agent/tool-catalog.js";

export type GithubToolPreferences = { enabledToolNames: string[]; enabledCategories: GithubToolCategory[] };

export function defaultGithubToolPreferences(): GithubToolPreferences {
  return { enabledToolNames: [...defaultEnabledGithubToolNames()], enabledCategories: [...defaultEnabledGithubToolCategories()] };
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch { return []; }
}

function sanitize(input: GithubToolPreferences): GithubToolPreferences {
  const definitions = listGithubToolDefinitions().filter(item => item.defaultEnabled);
  const names = new Set(definitions.map(item => item.name));
  const categories = new Set(definitions.map(item => item.category));
  return {
    enabledToolNames: [...new Set(input.enabledToolNames.filter(name => names.has(name)))],
    enabledCategories: [...new Set(input.enabledCategories.filter((name): name is GithubToolCategory => categories.has(name as GithubToolCategory)))]
  };
}

export async function getGithubToolPreferences(userId: string): Promise<GithubToolPreferences> {
  const rows = await getSql().query("SELECT enabled_tool_names, enabled_categories FROM github_tool_preferences WHERE user_id = $1 LIMIT 1", [userId]) as Record<string, unknown>[];
  if (!rows[0]) return defaultGithubToolPreferences();
  return sanitize({ enabledToolNames: asStringArray(rows[0].enabled_tool_names), enabledCategories: asStringArray(rows[0].enabled_categories) as GithubToolCategory[] });
}

export async function saveGithubToolPreferences(userId: string, input: GithubToolPreferences): Promise<GithubToolPreferences> {
  const safe = sanitize(input);
  await getSql().query("INSERT INTO github_tool_preferences (user_id, enabled_tool_names, enabled_categories) VALUES ($1, $2::jsonb, $3::jsonb) ON CONFLICT (user_id) DO UPDATE SET enabled_tool_names = EXCLUDED.enabled_tool_names, enabled_categories = EXCLUDED.enabled_categories, updated_at = now()", [userId, JSON.stringify(safe.enabledToolNames), JSON.stringify(safe.enabledCategories)]);
  return safe;
}
