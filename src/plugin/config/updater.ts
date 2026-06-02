/**
 * OpenCode configuration file updater.
 *
 * Updates ~/.config/opencode/opencode.json(c) with plugin models.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { OPENCODE_MODEL_DEFINITIONS, type OpencodeModelDefinition } from "./models";

// =============================================================================

// =============================================================================

export interface UpdateConfigResult {
  success: boolean;
  configPath: string;
  error?: string;
}

export interface OpencodeConfig {
  $schema?: string;
  plugin?: string[];
  provider?: {
    google?: {
      models?: Record<string, unknown>;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface UpdateConfigOptions {
  /** Override the config file path (for testing) */
  configPath?: string;
  /**
   * Environment used to read `OPENCODE_CONFIG` (defaults to `process.env`).
   * When set and `configPath` is omitted, the resolved path matches OpenCode / opencode-cursor.
   */
  env?: NodeJS.ProcessEnv;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function definitionToPlainObject(def: OpencodeModelDefinition): Record<string, unknown> {
  return JSON.parse(JSON.stringify(def)) as Record<string, unknown>;
}

// =============================================================================

// =============================================================================

const PLUGIN_NAME = "opencode-antigravity-auth@latest";
const SCHEMA_URL = "https://opencode.ai/config.json";
const OPENCODE_JSON_FILENAME = "opencode.json";
const OPENCODE_JSONC_FILENAME = "opencode.jsonc";

export function stripJsonCommentsAndTrailingCommas(json: string): string {
  return json
    .replace(
      /\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g,
      (match: string, group: string | undefined) => (group ? "" : match)
    )
    .replace(/,(\s*[}\]])/g, "$1");
}

/**
 * Get the opencode config directory path.
 */
export function getOpencodeConfigDir(): string {
  const xdgConfig = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(xdgConfig, "opencode");
}

/**
 * Get the opencode config file path.
 *
 * Prefers opencode.jsonc when present so we update the active config file
 * instead of creating a new opencode.json.
 */
export function getOpencodeConfigPath(): string {
  const configDir = getOpencodeConfigDir();
  const jsoncPath = join(configDir, OPENCODE_JSONC_FILENAME);
  const jsonPath = join(configDir, OPENCODE_JSON_FILENAME);

  if (existsSync(jsoncPath)) {
    return jsoncPath;
  }
  if (existsSync(jsonPath)) {
    return jsonPath;
  }

  return jsonPath;
}

/**
 * Resolves the active OpenCode config file: explicit `configPath`, then `OPENCODE_CONFIG`,
 * then default XDG layout (jsonc preferred).
 */
export function resolveActiveOpencodeConfigPath(options: UpdateConfigOptions = {}): string {
  if (options.configPath) {
    return resolve(options.configPath);
  }
  const envSource = options.env ?? process.env;
  const override = envSource.OPENCODE_CONFIG?.trim();
  if (override) {
    return resolve(override);
  }
  return getOpencodeConfigPath();
}

// =============================================================================

// =============================================================================

/**
 * Updates the opencode configuration file with plugin models.
 *
 * This function:
 * 1. Reads existing opencode.json/opencode.jsonc (or creates default structure)
 * 2. Replaces `provider.google.models` with plugin models
 * 3. Writes back to disk with proper formatting
 *
 * Preserves:
 * - $schema and other top-level config keys
 * - Non-google provider sections
 * - Other settings within google provider (except models)
 *
 * @param options - Optional configuration (e.g., custom configPath for testing)
 * @returns UpdateConfigResult with success status and path
 */
export async function updateOpencodeConfig(
  options: UpdateConfigOptions = {}
): Promise<UpdateConfigResult> {
  const configPath = resolveActiveOpencodeConfigPath(options);

  try {
    let config: OpencodeConfig;


    if (existsSync(configPath)) {
      const content = readFileSync(configPath, "utf-8");
      config = JSON.parse(stripJsonCommentsAndTrailingCommas(content)) as OpencodeConfig;
    } else {

      config = {
        $schema: SCHEMA_URL,
        plugin: [],
        provider: {},
      };
    }


    if (!config.$schema) {
      config.$schema = SCHEMA_URL;
    }


    if (!config.provider) {
      config.provider = {};
    }
    if (!config.provider.google) {
      config.provider.google = {};
    }


    config.provider.google.models = { ...OPENCODE_MODEL_DEFINITIONS };


    const configDir = dirname(configPath);
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }


    writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");

    return {
      success: true,
      configPath,
    };
  } catch (error) {
    return {
      success: false,
      configPath,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Merges built-in Antigravity/Google model definitions into `provider.google.models`
 * without removing user-defined model ids.
 *
 * For each model id in {@link OPENCODE_MODEL_DEFINITIONS}, plugin fields overwrite
 * the same keys on the existing entry so names/limits/variants stay current.
 * Custom models (ids not in the plugin map) are left unchanged.
 *
 * Use on plugin startup; use {@link updateOpencodeConfig} when a full replace is intended.
 */
export async function mergeAntigravityGoogleModelsIntoOpencodeConfig(
  options: UpdateConfigOptions = {},
): Promise<UpdateConfigResult> {
  const configPath = resolveActiveOpencodeConfigPath(options);

  try {
    let config: OpencodeConfig;

    if (existsSync(configPath)) {
      const content = readFileSync(configPath, "utf-8");
      config = JSON.parse(stripJsonCommentsAndTrailingCommas(content)) as OpencodeConfig;
    } else {
      config = {
        $schema: SCHEMA_URL,
        plugin: [],
        provider: {},
      };
    }

    let needsWrite = false;

    if (!config.$schema) {
      config.$schema = SCHEMA_URL;
      needsWrite = true;
    }

    if (!config.provider) {
      config.provider = {};
      needsWrite = true;
    }
    if (!config.provider.google) {
      config.provider.google = {};
      needsWrite = true;
    }

    const google = config.provider.google;
    const existingModels = isRecord(google.models) ? { ...google.models } : {};
    let modelsTouched = false;

    for (const [id, def] of Object.entries(OPENCODE_MODEL_DEFINITIONS)) {
      const pluginPlain = definitionToPlainObject(def);
      const prev = isRecord(existingModels[id])
        ? { ...(existingModels[id] as Record<string, unknown>) }
        : {};
      const next = { ...prev, ...pluginPlain };
      const prevNorm = isRecord(existingModels[id]) ? existingModels[id] : {};
      if (JSON.stringify(next) !== JSON.stringify(prevNorm)) {
        modelsTouched = true;
      }
      existingModels[id] = next;
    }

    if (modelsTouched) {
      google.models = existingModels;
      needsWrite = true;
    }

    if (!needsWrite) {
      return { success: true, configPath };
    }

    const configDir = dirname(configPath);
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");

    return {
      success: true,
      configPath,
    };
  } catch (error) {
    return {
      success: false,
      configPath,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
