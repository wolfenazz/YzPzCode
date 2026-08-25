import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Llms, type ProviderConfig } from "@cline/sdk";

export const COMMAND_CODE_PROVIDER_ID = "commandcode";
export const COMMAND_CODE_ANTHROPIC_PROVIDER_ID = "commandcode-anthropic";
export const COMMAND_CODE_BASE_URL = "https://api.commandcode.ai/provider/v1";

const COMMAND_CODE_MODELS_URL = `${COMMAND_CODE_BASE_URL}/models`;
const MODEL_REFRESH_TTL_MS = 60 * 60 * 1000;
const MODEL_REFRESH_TIMEOUT_MS = 15_000;

interface CommandCodeApiModel {
  id: string;
  name: string;
  context_length: number;
}

interface CommandCodeModelsResponse {
  data?: unknown;
}

interface CommandCodeModelInfo {
  id: string;
  name: string;
  contextWindow: number;
  maxInputTokens: number;
  capabilities: Array<"tools" | "streaming" | "reasoning" | "images">;
  status: "active";
}

interface CommandCodeRuntimeModelInfo {
  id: string;
  contextWindow?: number;
  maxInputTokens?: number;
}

/**
 * Offline fallback copied from Command Code's public `/provider/v1/models`
 * response. The live endpoint is refreshed on demand, but keeping exact limits
 * here prevents the SDK's 128K fallback from causing premature compaction when
 * the machine starts offline.
 */
const FALLBACK_MODELS: ReadonlyArray<readonly [string, string, number]> = [
  ["claude-sonnet-5", "Claude Sonnet 5", 1_000_000],
  ["claude-sonnet-4-6", "Claude Sonnet 4.6", 1_000_000],
  ["claude-fable-5", "Claude Fable 5", 1_000_000],
  ["claude-opus-5", "Claude Opus 5", 1_000_000],
  ["claude-opus-4-8", "Claude Opus 4.8", 1_000_000],
  ["claude-opus-4-7", "Claude Opus 4.7", 1_000_000],
  ["claude-haiku-4-5-20251001", "Claude Haiku 4.5", 200_000],
  ["gpt-5.6-sol", "GPT-5.6 Sol", 1_050_000],
  ["gpt-5.6-terra", "GPT-5.6 Terra", 1_050_000],
  ["gpt-5.6-luna", "GPT-5.6 Luna", 1_050_000],
  ["gpt-5.5", "GPT-5.5", 400_000],
  ["gpt-5.4", "GPT-5.4", 400_000],
  ["gpt-5.3-codex", "GPT-5.3 Codex", 400_000],
  ["gpt-5.4-mini", "GPT-5.4 Mini", 400_000],
  ["deepseek/deepseek-v4-pro", "DeepSeek V4 Pro (latest)", 1_000_000],
  ["deepseek/deepseek-v4-flash", "DeepSeek V4 Flash (latest)", 1_000_000],
  ["deepseek/deepseek-v4-flash-vision-exp", "DeepSeek V4 Flash Vision (exp)", 1_000_000],
  ["moonshotai/Kimi-K3", "Kimi K3", 1_000_000],
  ["moonshotai/Kimi-K2.7-Code", "Kimi K2.7 Code", 256_000],
  ["moonshotai/Kimi-K2.7-Code-Highspeed", "Kimi K2.7 Code HighSpeed", 262_000],
  ["moonshotai/Kimi-K2.6", "Kimi K2.6", 256_000],
  ["moonshotai/Kimi-K2.5", "Kimi K2.5", 256_000],
  ["zai-org/GLM-5.3", "GLM-5.3", 1_000_000],
  ["zai-org/GLM-5.2", "GLM-5.2", 1_000_000],
  ["zai-org/GLM-5.2-Fast", "GLM-5.2 Fast", 1_000_000],
  ["zai-org/GLM-5.1", "GLM-5.1", 200_000],
  ["zai-org/GLM-5", "GLM-5", 200_000],
  ["MiniMaxAI/MiniMax-M3", "MiniMax M3", 1_000_000],
  ["MiniMaxAI/MiniMax-M2.7", "MiniMax M2.7", 200_000],
  ["MiniMaxAI/MiniMax-M2.5", "MiniMax M2.5", 200_000],
  ["xiaomi/mimo-v2.5-pro", "MiMo V2.5 Pro", 1_000_000],
  ["xiaomi/mimo-v2.5", "MiMo V2.5", 1_000_000],
  ["Qwen/Qwen3.8-Max", "Qwen 3.8 Max", 1_000_000],
  ["Qwen/Qwen3.8-27B", "Qwen 3.8 27B", 262_144],
  ["Qwen/Qwen3.7-Max", "Qwen 3.7 Max", 1_000_000],
  ["Qwen/Qwen3.7-Plus", "Qwen 3.7 Plus", 1_000_000],
  ["Qwen/Qwen3.7-Flash", "Qwen 3.7 Flash", 1_000_000],
  ["Qwen/Qwen3.6-Max-Preview", "Qwen 3.6 Max Preview", 200_000],
  ["Qwen/Qwen3.6-Plus", "Qwen 3.6 Plus", 200_000],
  ["stepfun/Step-3.7-Flash", "Step 3.7 Flash", 256_000],
  ["stepfun/Step-3.5-Flash", "Step 3.5 Flash", 1_000_000],
  ["tencent/hy3-paid", "Tencent Hy3", 262_144],
  ["google/gemini-3.7-flash", "Gemini 3.7 Flash", 1_048_576],
  ["google/gemini-3.6-flash", "Gemini 3.6 Flash", 1_000_000],
  ["google/gemini-3.5-flash", "Gemini 3.5 Flash", 1_000_000],
  ["google/gemini-3.5-flash-lite", "Gemini 3.5 Flash Lite", 1_000_000],
  ["google/gemini-3.1-flash-lite", "Gemini 3.1 Flash Lite", 1_000_000],
  ["sakana/fugu-ultra", "Fugu Ultra", 1_000_000],
  ["nvidia/nemotron-3-ultra-550b-a55b", "Nemotron 3 Ultra", 1_000_000],
  ["thinkingmachines/inkling", "Inkling", 256_000],
  ["thinkingmachines/inkling-small", "Inkling Small", 1_000_000],
  ["stealth/ox-alpha", "Ox Alpha", 1_048_576],
  ["poolside/laguna-s-2.1-free", "Laguna S 2.1", 256_000],
  ["meta/muse-spark-1.1", "Muse Spark 1.1", 1_048_576],
  ["meta/muse-spark-1.2", "Muse Spark 1.2", 1_048_576],
  ["meta/muse-spark-1.2-contributor", "Muse Spark 1.2 Contributor", 1_048_576],
  ["xai/grok-4.5", "Grok 4.5", 500_000],
  ["xai/grok-4.6", "Grok 4.6", 500_000],
];

const VISION_MODEL_RE =
  /(claude-|vision|kimi-k2\.|gemini-|muse-spark|inkling|ox-alpha|qwen3\.8|fugu-ultra)/i;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

export const isCommandCodeProvider = (providerId: string): boolean =>
  providerId === COMMAND_CODE_PROVIDER_ID || providerId === COMMAND_CODE_ANTHROPIC_PROVIDER_ID;

export const isCommandCodeAnthropicModel = (modelId: string): boolean =>
  modelId.toLowerCase().startsWith("claude-");

export const commandCodeSiblingProvider = (providerId: string): string | undefined => {
  if (providerId === COMMAND_CODE_PROVIDER_ID) return COMMAND_CODE_ANTHROPIC_PROVIDER_ID;
  if (providerId === COMMAND_CODE_ANTHROPIC_PROVIDER_ID) return COMMAND_CODE_PROVIDER_ID;
  return undefined;
};

export function assertCommandCodeModelProtocol(providerId: string, modelId: string): void {
  if (!isCommandCodeProvider(providerId)) return;
  const anthropicModel = isCommandCodeAnthropicModel(modelId);
  if (providerId === COMMAND_CODE_PROVIDER_ID && anthropicModel) {
    throw new Error(
      `Model "${modelId}" uses Command Code's Anthropic endpoint. Select the "Command Code · Claude" provider.`,
    );
  }
  if (providerId === COMMAND_CODE_ANTHROPIC_PROVIDER_ID && !anthropicModel) {
    throw new Error(
      `Model "${modelId}" uses Command Code's OpenAI-compatible endpoint. Select the "Command Code" provider.`,
    );
  }
}

const toModelInfo = (model: CommandCodeApiModel): CommandCodeModelInfo => ({
  id: model.id,
  name: model.name,
  contextWindow: model.context_length,
  maxInputTokens: model.context_length,
  capabilities: [
    "tools",
    "streaming",
    "reasoning",
    ...(VISION_MODEL_RE.test(model.id) ? (["images"] as const) : []),
  ],
  status: "active",
});

const fallbackApiModels = (): CommandCodeApiModel[] =>
  FALLBACK_MODELS.map(([id, name, context_length]) => ({ id, name, context_length }));

function splitModels(models: CommandCodeApiModel[]): {
  openAi: Record<string, CommandCodeModelInfo>;
  anthropic: Record<string, CommandCodeModelInfo>;
} {
  const openAi: Record<string, CommandCodeModelInfo> = {};
  const anthropic: Record<string, CommandCodeModelInfo> = {};
  for (const model of models) {
    const destination = isCommandCodeAnthropicModel(model.id) ? anthropic : openAi;
    destination[model.id] = toModelInfo(model);
  }
  return { openAi, anthropic };
}

/**
 * Cline's public provider catalog and its local agent runtime use different
 * registries. In SDK 0.0.74 the local runtime drops `routingProviderId` while
 * constructing its per-session gateway, so catalog-only custom providers fail
 * on the first model call with `Unknown or disabled provider`.
 *
 * Register concrete handlers for our public ids and delegate to Cline's native
 * transports. This preserves the Command Code ids in session metadata/UI while
 * sending non-Claude models through OpenAI Chat Completions and Claude models
 * through Anthropic Messages, as required by the Provider API.
 */
function registerCommandCodeRuntimeHandlers(): void {
  if (!Llms.hasRegisteredHandler(COMMAND_CODE_PROVIDER_ID)) {
    Llms.registerHandler(COMMAND_CODE_PROVIDER_ID, (config: ProviderConfig) =>
      Llms.createHandler({
        ...config,
        providerId: "openai-compatible",
        routingProviderId: undefined,
        clientType: "openai-compatible",
      }),
    );
  }

  if (!Llms.hasRegisteredHandler(COMMAND_CODE_ANTHROPIC_PROVIDER_ID)) {
    Llms.registerHandler(COMMAND_CODE_ANTHROPIC_PROVIDER_ID, (config: ProviderConfig) =>
      Llms.createHandler({
        ...config,
        providerId: "anthropic",
        routingProviderId: undefined,
        clientType: "anthropic",
      }),
    );
  }
}

/** Register both native API protocols before the renderer can query providers. */
export function registerCommandCodeProviders(): void {
  registerCommandCodeRuntimeHandlers();
  const models = splitModels(fallbackApiModels());
  const knownProviders = new Set(Llms.getProviderIds());

  if (!knownProviders.has(COMMAND_CODE_PROVIDER_ID)) {
    Llms.registerProvider({
      provider: {
        id: COMMAND_CODE_PROVIDER_ID,
        name: "Command Code",
        description: "GOAT, Pro, Max, Team, and Provider plans via the Command Code Provider API",
        protocol: "openai-chat",
        baseUrl: COMMAND_CODE_BASE_URL,
        defaultModelId: "deepseek/deepseek-v4-flash",
        capabilities: ["tools", "streaming", "reasoning", "vision"],
        env: ["COMMAND_CODE_API_KEY", "COMMANDCODE_API_KEY"],
        client: "openai-compatible",
        source: "system",
      },
      models: models.openAi,
    } as never);
  }

  if (!knownProviders.has(COMMAND_CODE_ANTHROPIC_PROVIDER_ID)) {
    Llms.registerProvider({
      provider: {
        id: COMMAND_CODE_ANTHROPIC_PROVIDER_ID,
        name: "Command Code · Claude",
        description: "Claude models on Command Code Pro, Max, Team, and Provider plans",
        protocol: "anthropic",
        baseUrl: COMMAND_CODE_BASE_URL,
        defaultModelId: "claude-sonnet-5",
        capabilities: ["tools", "streaming", "reasoning", "vision"],
        env: ["COMMAND_CODE_API_KEY", "COMMANDCODE_API_KEY"],
        client: "anthropic",
        source: "system",
      },
      models: models.anthropic,
    } as never);
  }
}

let lastRefreshAt = 0;
let refreshInFlight: Promise<void> | null = null;

const parseLiveModels = (payload: CommandCodeModelsResponse): CommandCodeApiModel[] => {
  if (!Array.isArray(payload.data)) throw new Error("Command Code returned an invalid models payload");
  const models: CommandCodeApiModel[] = [];
  for (const entry of payload.data) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as Record<string, unknown>;
    if (!isNonEmptyString(raw.id) || !isNonEmptyString(raw.name)) continue;
    if (typeof raw.context_length !== "number" || !Number.isFinite(raw.context_length) || raw.context_length <= 0) {
      continue;
    }
    models.push({ id: raw.id, name: raw.name, context_length: Math.floor(raw.context_length) });
  }
  if (models.length === 0) throw new Error("Command Code returned an empty models catalog");
  return models;
};

/** Refresh names and exact context windows without blocking offline startup. */
export async function refreshCommandCodeModels(force = false): Promise<void> {
  if (!force && Date.now() - lastRefreshAt < MODEL_REFRESH_TTL_MS) return;
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const response = await fetch(COMMAND_CODE_MODELS_URL, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(MODEL_REFRESH_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Command Code models request failed with HTTP ${response.status}`);
    const models = splitModels(parseLiveModels((await response.json()) as CommandCodeModelsResponse));
    for (const [modelId, info] of Object.entries(models.openAi)) {
      Llms.registerModel(COMMAND_CODE_PROVIDER_ID, modelId, info as never);
    }
    for (const [modelId, info] of Object.entries(models.anthropic)) {
      Llms.registerModel(COMMAND_CODE_ANTHROPIC_PROVIDER_ID, modelId, info as never);
    }
    lastRefreshAt = Date.now();
  })();

  try {
    await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

const authFileApiKey = (): string | undefined => {
  const path = join(homedir(), ".commandcode", "auth.json");
  if (!existsSync(path)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    if (isNonEmptyString(parsed.apiKey)) return parsed.apiKey.trim();
    const official = parsed["command-code"];
    if (official && typeof official === "object") {
      const key = (official as Record<string, unknown>).key;
      if (isNonEmptyString(key)) return key.trim();
    }
  } catch {
    // A malformed/unreadable auth file is treated like a missing credential.
  }
  return undefined;
};

/** Never persists or logs the CLI credential; it is read only when needed. */
export const resolveCommandCodeApiKey = (explicit?: string): string | undefined => {
  if (isNonEmptyString(explicit)) return explicit.trim();
  for (const envName of ["COMMAND_CODE_API_KEY", "COMMANDCODE_API_KEY", "CMD_API_KEY"]) {
    const value = process.env[envName];
    if (isNonEmptyString(value)) return value.trim();
  }
  return authFileApiKey();
};

export const hasCommandCodeApiKey = (): boolean => resolveCommandCodeApiKey() !== undefined;

/** Honor the Provider API's documented zero-data-retention opt-in. */
export const commandCodeRequestHeaders = (providerId: string): Record<string, string> | undefined => {
  if (!isCommandCodeProvider(providerId)) return undefined;
  const enabled = process.env.CMD_ZDR?.trim().toLowerCase();
  return enabled === "1" || enabled === "true" ? { "x-cmd-zdr": "1" } : undefined;
};

/**
 * The public Llms catalog and the session execution gateway are separate SDK
 * registries. Route our public provider ids through the matching built-in
 * protocol handler so a catalog-visible Command Code model is executable too.
 */
export function commandCodeRuntimeProviderConfig(args: {
  providerId: string;
  modelId: string;
  apiKey?: string;
  baseUrl?: string;
  headers?: Record<string, string>;
  knownModels: Record<string, CommandCodeRuntimeModelInfo>;
}): ProviderConfig | undefined {
  if (!isCommandCodeProvider(args.providerId)) return undefined;
  assertCommandCodeModelProtocol(args.providerId, args.modelId);
  const anthropic = args.providerId === COMMAND_CODE_ANTHROPIC_PROVIDER_ID;
  const modelInfo = args.knownModels[args.modelId];
  return {
    providerId: args.providerId,
    routingProviderId: anthropic ? "anthropic" : "openai-compatible",
    clientType: anthropic ? "anthropic" : "openai-compatible",
    apiKey: args.apiKey,
    baseUrl: args.baseUrl ?? COMMAND_CODE_BASE_URL,
    headers: args.headers,
    modelId: args.modelId,
    modelInfo,
    knownModels: args.knownModels,
    maxInputTokens: modelInfo?.maxInputTokens ?? modelInfo?.contextWindow,
    capabilities: ["tools", "reasoning", "streaming", ...(VISION_MODEL_RE.test(args.modelId) ? ["vision" as const] : [])],
  };
}
