import { describe, test, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  mergeAntigravityGoogleModelsIntoOpencodeConfig,
  resolveActiveOpencodeConfigPath,
  updateOpencodeConfig,
} from "./updater";
import { OPENCODE_MODEL_DEFINITIONS } from "./models";

describe("updateOpencodeConfig", () => {
  let tempDir: string;
  let configPath: string;
  let originalXdgConfigHome: string | undefined;

  beforeEach(() => {
    originalXdgConfigHome = process.env.XDG_CONFIG_HOME;

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-test-"));
    configPath = path.join(tempDir, "opencode.json");
  });

  afterEach(() => {
    if (originalXdgConfigHome === undefined) {
      delete process.env.XDG_CONFIG_HOME;
    } else {
      process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
    }


    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("creates new config with default structure when file does not exist", async () => {
    const result = await updateOpencodeConfig({ configPath });

    expect(result.success).toBe(true);
    expect(result.configPath).toBe(configPath);
    expect(fs.existsSync(configPath)).toBe(true);


    const writtenConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(writtenConfig.$schema).toBe("https://opencode.ai/config.json");
    expect(writtenConfig.plugin).toContain("opencode-antigravity-auth@latest");
    expect(writtenConfig.provider?.google?.models).toBeDefined();
  });

  test("replaces existing google models with plugin models", async () => {
    const existingConfig = {
      $schema: "https://opencode.ai/config.json",
      plugin: ["opencode-antigravity-auth@latest"],
      provider: {
        google: {
          models: {
            "old-model": { name: "Old Model" },
          },
        },
      },
    };
    fs.writeFileSync(configPath, JSON.stringify(existingConfig));

    const result = await updateOpencodeConfig({ configPath });

    expect(result.success).toBe(true);

    const writtenConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

    expect(writtenConfig.provider.google.models["old-model"]).toBeUndefined();

    expect(writtenConfig.provider.google.models["antigravity-gemini-3-pro"]).toBeDefined();
    expect(writtenConfig.provider.google.models["antigravity-claude-sonnet-4-6"]).toBeDefined();
  });

  test("preserves non-google provider sections", async () => {
    const existingConfig = {
      $schema: "https://opencode.ai/config.json",
      plugin: ["opencode-antigravity-auth@latest"],
      provider: {
        google: {
          models: { "old-model": {} },
        },
        anthropic: {
          apiKey: "secret-key",
          models: { "claude-3": {} },
        },
        openai: {
          models: { "gpt-4": {} },
        },
      },
    };
    fs.writeFileSync(configPath, JSON.stringify(existingConfig));

    const result = await updateOpencodeConfig({ configPath });

    expect(result.success).toBe(true);

    const writtenConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

    expect(writtenConfig.provider.anthropic).toEqual(existingConfig.provider.anthropic);
    expect(writtenConfig.provider.openai).toEqual(existingConfig.provider.openai);
  });

  test("preserves $schema and other top-level config keys", async () => {
    const existingConfig = {
      $schema: "https://opencode.ai/config.json",
      plugin: ["opencode-antigravity-auth@latest", "other-plugin"],
      theme: "dark",
      customSetting: { nested: true },
      provider: {
        google: { models: {} },
      },
    };
    fs.writeFileSync(configPath, JSON.stringify(existingConfig));

    const result = await updateOpencodeConfig({ configPath });

    expect(result.success).toBe(true);

    const writtenConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(writtenConfig.$schema).toBe("https://opencode.ai/config.json");
    expect(writtenConfig.plugin).toContain("other-plugin");
    expect(writtenConfig.theme).toBe("dark");
    expect(writtenConfig.customSetting).toEqual({ nested: true });
  });

  test("adds plugin to existing plugin array if not present", async () => {
    const existingConfig = {
      plugin: ["other-plugin"],
      provider: {},
    };
    fs.writeFileSync(configPath, JSON.stringify(existingConfig));

    const result = await updateOpencodeConfig({ configPath });

    expect(result.success).toBe(true);

    const writtenConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(writtenConfig.plugin).toContain("opencode-antigravity-auth@latest");
    expect(writtenConfig.plugin).toContain("other-plugin");
  });

  test("does not duplicate plugin if already present", async () => {
    const existingConfig = {
      plugin: ["opencode-antigravity-auth@latest", "other-plugin"],
      provider: {},
    };
    fs.writeFileSync(configPath, JSON.stringify(existingConfig));

    const result = await updateOpencodeConfig({ configPath });

    expect(result.success).toBe(true);

    const writtenConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const pluginCount = writtenConfig.plugin.filter(
      (p: string) => p.includes("opencode-antigravity-auth")
    ).length;
    expect(pluginCount).toBe(1);
  });

  test("does not duplicate plugin if different version present", async () => {
    const existingConfig = {
      plugin: ["opencode-antigravity-auth@beta", "other-plugin"],
      provider: {},
    };
    fs.writeFileSync(configPath, JSON.stringify(existingConfig));

    const result = await updateOpencodeConfig({ configPath });

    expect(result.success).toBe(true);

    const writtenConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const pluginCount = writtenConfig.plugin.filter(
      (p: string) => p.includes("opencode-antigravity-auth")
    ).length;

    expect(pluginCount).toBe(1);

    expect(writtenConfig.plugin).toContain("opencode-antigravity-auth@beta");
  });

  test("writes config with proper JSON formatting (2-space indent)", async () => {
    const result = await updateOpencodeConfig({ configPath });

    expect(result.success).toBe(true);

    const writtenContent = fs.readFileSync(configPath, "utf-8");

    expect(writtenContent).toContain("\n");
    expect(writtenContent).toMatch(/^\{\n {2}/);
  });

  test("returns error result on invalid JSON in existing config", async () => {
    fs.writeFileSync(configPath, "{ invalid json }");

    const result = await updateOpencodeConfig({ configPath });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  test("includes all model definitions from OPENCODE_MODEL_DEFINITIONS", async () => {
    const result = await updateOpencodeConfig({ configPath });

    expect(result.success).toBe(true);

    const writtenConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const models = writtenConfig.provider.google.models;

    // Verify all models from OPENCODE_MODEL_DEFINITIONS are included
    for (const modelKey of Object.keys(OPENCODE_MODEL_DEFINITIONS)) {
      expect(models[modelKey]).toBeDefined();
    }
  });

  test("parses existing jsonc config files with comments and trailing commas", async () => {
    const jsoncPath = path.join(tempDir, "opencode.jsonc");
    const existingJsoncConfig = `{

  "plugin": [
    "other-plugin",
  ],
  "provider": {
    "google": {
      "region": "us-central1",
    },
  },
}`;
    fs.writeFileSync(jsoncPath, existingJsoncConfig);

    const result = await updateOpencodeConfig({ configPath: jsoncPath });

    expect(result.success).toBe(true);
    expect(result.configPath).toBe(jsoncPath);

    const writtenConfig = JSON.parse(fs.readFileSync(jsoncPath, "utf-8"));
    expect(writtenConfig.plugin).toContain("other-plugin");
    expect(writtenConfig.plugin).toContain("opencode-antigravity-auth@latest");
    expect(writtenConfig.provider.google.region).toBe("us-central1");
    expect(writtenConfig.provider.google.models["antigravity-gemini-3-pro"]).toBeDefined();
  });

  test("prefers existing opencode.jsonc when using default config path", async () => {
    const opencodeDir = path.join(tempDir, "opencode");
    const jsonPath = path.join(opencodeDir, "opencode.json");
    const jsoncPath = path.join(opencodeDir, "opencode.jsonc");

    fs.mkdirSync(opencodeDir, { recursive: true });
    fs.writeFileSync(jsoncPath, JSON.stringify({ plugin: ["other-plugin"], provider: {} }, null, 2));
    process.env.XDG_CONFIG_HOME = tempDir;

    const result = await updateOpencodeConfig();

    expect(result.success).toBe(true);
    expect(result.configPath).toBe(jsoncPath);
    expect(fs.existsSync(jsonPath)).toBe(false);
    expect(fs.existsSync(jsoncPath)).toBe(true);
  });

  test("creates parent directory if it does not exist", async () => {
    const nestedPath = path.join(tempDir, "nested", "dir", "opencode.json");

    const result = await updateOpencodeConfig({ configPath: nestedPath });

    expect(result.success).toBe(true);
    expect(fs.existsSync(nestedPath)).toBe(true);
  });

  test("adds $schema if missing from existing config", async () => {
    const existingConfig = {
      plugin: ["opencode-antigravity-auth@latest"],
      provider: { google: {} },
    };
    fs.writeFileSync(configPath, JSON.stringify(existingConfig));

    const result = await updateOpencodeConfig({ configPath });

    expect(result.success).toBe(true);

    const writtenConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(writtenConfig.$schema).toBe("https://opencode.ai/config.json");
  });

  test("preserves other google provider settings besides models", async () => {
    const existingConfig = {
      plugin: ["opencode-antigravity-auth@latest"],
      provider: {
        google: {
          apiKey: "test-key",
          models: { "old-model": {} },
          customSetting: true,
        },
      },
    };
    fs.writeFileSync(configPath, JSON.stringify(existingConfig));

    const result = await updateOpencodeConfig({ configPath });

    expect(result.success).toBe(true);

    const writtenConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

    expect(writtenConfig.provider.google.apiKey).toBe("test-key");
    expect(writtenConfig.provider.google.customSetting).toBe(true);

    expect(writtenConfig.provider.google.models["old-model"]).toBeUndefined();
  });

  test("uses OPENCODE_CONFIG from options.env when configPath omitted", async () => {
    const viaEnvPath = path.join(tempDir, "via-opencode-env.json");
    fs.writeFileSync(
      viaEnvPath,
      JSON.stringify({ provider: { google: { models: {} } } }, null, 2),
    );

    const result = await updateOpencodeConfig({
      env: { OPENCODE_CONFIG: viaEnvPath },
    });

    expect(result.success).toBe(true);
    expect(result.configPath).toBe(path.resolve(viaEnvPath));
    const written = JSON.parse(fs.readFileSync(viaEnvPath, "utf-8"));
    expect(written.provider.google.models["antigravity-gemini-3-pro"]).toBeDefined();
  });

  test("resolveActiveOpencodeConfigPath prefers explicit configPath over env", () => {
    const explicit = path.join(tempDir, "explicit.json");
    const envPath = path.join(tempDir, "env.json");
    expect(
      resolveActiveOpencodeConfigPath({
        configPath: explicit,
        env: { OPENCODE_CONFIG: envPath },
      }),
    ).toBe(path.resolve(explicit));
  });
});

describe("mergeAntigravityGoogleModelsIntoOpencodeConfig", () => {
  let tempDir: string;
  let configPath: string;
  let originalXdgConfigHome: string | undefined;

  beforeEach(() => {
    originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-merge-test-"));
    configPath = path.join(tempDir, "opencode.json");
  });

  afterEach(() => {
    if (originalXdgConfigHome === undefined) {
      delete process.env.XDG_CONFIG_HOME;
    } else {
      process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
    }
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("preserves user-only google model ids while merging plugin definitions", async () => {
    const existingConfig = {
      $schema: "https://opencode.ai/config.json",
      plugin: ["opencode-antigravity-auth@latest"],
      provider: {
        google: {
          npm: "@ai-sdk/google",
          models: {
            "my-custom-gemini": { name: "My Custom", limit: { context: 1, output: 2 } },
          },
        },
      },
    };
    fs.writeFileSync(configPath, JSON.stringify(existingConfig));

    const result = await mergeAntigravityGoogleModelsIntoOpencodeConfig({ configPath });

    expect(result.success).toBe(true);
    const written = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(written.provider.google.models["my-custom-gemini"]).toEqual(
      existingConfig.provider.google.models["my-custom-gemini"],
    );
    expect(written.provider.google.models["antigravity-gemini-3.1-pro"]).toMatchObject({
      name: "Gemini 3.1 Pro (Antigravity)",
    });
  });

  test("overlays plugin fields onto existing known model entry", async () => {
    const staleName = "Stale name from old config";
    const existingConfig = {
      $schema: "https://opencode.ai/config.json",
      plugin: ["opencode-antigravity-auth@latest"],
      provider: {
        google: {
          models: {
            "antigravity-gemini-3.1-pro": {
              name: staleName,
              limit: { context: 100, output: 50 },
              modalities: { input: ["text"], output: ["text"] },
            },
          },
        },
      },
    };
    fs.writeFileSync(configPath, JSON.stringify(existingConfig));

    const result = await mergeAntigravityGoogleModelsIntoOpencodeConfig({ configPath });

    expect(result.success).toBe(true);
    const written = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const merged = written.provider.google.models["antigravity-gemini-3.1-pro"];
    expect(merged.name).toBe(OPENCODE_MODEL_DEFINITIONS["antigravity-gemini-3.1-pro"]!.name);
    expect(merged.limit).toEqual(OPENCODE_MODEL_DEFINITIONS["antigravity-gemini-3.1-pro"]!.limit);
  });

  test("does not rewrite file when google models already match plugin definitions", async () => {
    const models = JSON.parse(JSON.stringify(OPENCODE_MODEL_DEFINITIONS)) as Record<string, unknown>;
    const existingConfig = {
      $schema: "https://opencode.ai/config.json",
      plugin: ["opencode-antigravity-auth@latest"],
      provider: {
        google: {
          npm: "@ai-sdk/google",
          models,
        },
      },
    };
    fs.writeFileSync(configPath, JSON.stringify(existingConfig, null, 2));
    const before = fs.readFileSync(configPath, "utf-8");

    const result = await mergeAntigravityGoogleModelsIntoOpencodeConfig({ configPath });

    expect(result.success).toBe(true);
    const after = fs.readFileSync(configPath, "utf-8");
    expect(after).toBe(before);
  });

  test("merges via OPENCODE_CONFIG in options.env", async () => {
    const viaEnvPath = path.join(tempDir, "merge-via-env.json");
    fs.writeFileSync(
      viaEnvPath,
      JSON.stringify({ provider: { google: { models: {} } } }, null, 2),
    );

    const result = await mergeAntigravityGoogleModelsIntoOpencodeConfig({
      env: { OPENCODE_CONFIG: viaEnvPath },
    });

    expect(result.success).toBe(true);
    expect(result.configPath).toBe(path.resolve(viaEnvPath));
    const written = JSON.parse(fs.readFileSync(viaEnvPath, "utf-8"));
    expect(written.provider.google.models["antigravity-gemini-3-pro"]).toBeDefined();
  });
});
