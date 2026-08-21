// Live provider/model catalog sync for the YZPZ Agent harness.
//
// The Cline SDK ships a static model catalog baked into @cline/llms at publish
// time, and the app pins the SDK version. When a provider (e.g. OpenCode Zen)
// publishes new models on models.dev, the static catalog never sees them. This
// module keeps the in-process Llms registry fresh by fetching
// https://models.dev/api.json periodically and ADDITIVELY merging:
//   - missing model ids into providers that already exist in the registry
//   - brand-new providers (only when we can map them to an SDK client AND they
//     expose a base URL)
// Existing entries are never modified or removed, so sessions and defaults are
// unaffected.
//
// The last successful payload is cached under <dataDir>/catalog-cache.json so a
// fresh process (or an offline one) still applies the most recent delta.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Llms } from "@cline/sdk";

const MODELS_DEV_URL = "https://models.dev/api.json";
const DEFAULT_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12h
const FETCH_TIMEOUT_MS = 15_000;
const CACHE_VERSION = 1;

/** Minimal structural view of ModelInfo — matches what registerModel accepts. */
interface CatalogModelInfo {
  id: string;
  name?: string;
  description?: string;
  contextWindow?: number;
  maxInputTokens?: number;
  maxTokens?: number;
  capabilities?: string[];
  reasoningOptions?: Array<Record<string, unknown>>;
  pricing?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
  status?: string;
  releaseDate?: string;
  family?: string;
}

type CatalogModelMap = Record<string, CatalogModelInfo>;

/** Provider-level metadata from the raw models.dev api.json payload. */
interface ModelsDevProviderMeta {
  id?: string;
  name?: string;
  doc?: string;
  env?: unknown;
  npm?: unknown;
  api?: unknown;
  models?: Record<string, Record<string, unknown>>;
}

export interface CatalogSyncResult {
  syncedAt: string | null;
  providersAdded: string[];
  modelsAdded: Array<{ providerId: string; modelId: string }>;
  skippedProviders: number;
  source: "network" | "cache" | "skipped";
}

interface CacheFile {
  version: number;
  fetchedAt: string;
  raw: Record<string, ModelsDevProviderMeta>;
}

const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

/** Map an npm package name from models.dev to an SDK client/protocol pair. */
function mapClient(
  npm: unknown,
): { client: string; protocol: string } | undefined {
  if (typeof npm !== "string" || !npm) return undefined;
  switch (npm) {
    case "@ai-sdk/openai-compatible":
      return { client: "openai-compatible", protocol: "openai-chat" };
    case "@ai-sdk/openai":
      return { client: "openai", protocol: "openai-chat" };
    case "@ai-sdk/anthropic":
      return { client: "anthropic", protocol: "anthropic" };
    case "@ai-sdk/google":
      return { client: "gemini", protocol: "gemini" };
    default:
      if (npm.startsWith("@ai-sdk/")) {
        return { client: "ai-sdk-community", protocol: "openai-chat" };
      }
      return undefined;
  }
}

/**
 * Tolerant re-normalization of a raw models.dev model entry into our minimal
 * ModelInfo shape. Used only for the offline cache path; the network path uses
 * the SDK's own normalizer, which produces richer metadata.
 */
function normalizeRawModel(modelId: string, entry: Record<string, unknown>): CatalogModelInfo {
  const limit = (entry.limit ?? {}) as Record<string, unknown>;
  const cost = (entry.cost ?? {}) as Record<string, unknown>;
  const info: CatalogModelInfo = { id: modelId };
  const name = str(entry.name);
  if (name) info.name = name;
  const contextWindow = num(limit.context);
  if (contextWindow !== undefined) {
    info.contextWindow = contextWindow;
    info.maxInputTokens = num(limit.input) ?? contextWindow;
  }
  const maxTokens = num(limit.output);
  if (maxTokens !== undefined) info.maxTokens = maxTokens;

  const capabilities: string[] = [];
  if (entry.tool_call === true) capabilities.push("tools");
  if (entry.reasoning === true) capabilities.push("reasoning");
  if (entry.structured_output === true) capabilities.push("structured_output");
  if (entry.temperature === true) capabilities.push("temperature");
  const modalities = (entry.modalities ?? {}) as Record<string, unknown>;
  if (Array.isArray(modalities.input)) {
    if (modalities.input.includes("image")) capabilities.push("images");
    if (modalities.input.includes("pdf") || modalities.input.includes("file")) {
      capabilities.push("files");
    }
  }
  if (capabilities.length > 0) info.capabilities = capabilities;

  if (Array.isArray(entry.reasoning_options)) {
    info.reasoningOptions = entry.reasoning_options.filter(
      (o): o is Record<string, unknown> => !!o && typeof o === "object",
    );
  }
  const pricing: Record<string, number | undefined> = {};
  pricing.input = num(cost.input);
  pricing.output = num(cost.output);
  pricing.cacheRead = num(cost.cache_read);
  pricing.cacheWrite = num(cost.cache_write);
  if (Object.values(pricing).some((v) => v !== undefined)) info.pricing = pricing;

  const status = str(entry.status);
  if (status && ["active", "preview", "deprecated", "legacy"].includes(status)) {
    info.status = status;
  }
  const releaseDate = str(entry.release_date);
  if (releaseDate) info.releaseDate = releaseDate;
  const family = str(entry.family);
  if (family) info.family = family;
  return info;
}

function modelsFromRaw(raw: Record<string, ModelsDevProviderMeta>): Record<string, CatalogModelMap> {
  const out: Record<string, CatalogModelMap> = {};
  for (const [providerId, meta] of Object.entries(raw ?? {})) {
    if (!meta || typeof meta !== "object" || !meta.models) continue;
    const models: CatalogModelMap = {};
    for (const [modelId, entry] of Object.entries(meta.models)) {
      if (!entry || typeof entry !== "object") continue;
      models[modelId] = normalizeRawModel(modelId, entry);
    }
    if (Object.keys(models).length > 0) out[providerId] = models;
  }
  return out;
}

export class CatalogSync {
  private readonly dataDir: string;
  private sink: ((name: string, payload: unknown) => void) | null = null;
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<CatalogSyncResult> | null = null;
  private appliedThisProcess = false;
  private lastSyncedAt: string | null = null;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  setEventSink(cb: (name: string, payload: unknown) => void): void {
    this.sink = cb;
  }

  start(intervalMs: number = DEFAULT_INTERVAL_MS): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.sync().catch((err) => {
        console.error(`[yzpz-agent] catalog: periodic sync failed: ${err}`);
      });
    }, intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async sync(opts?: { force?: boolean }): Promise<CatalogSyncResult> {
    const force = opts?.force === true;
    // Within TTL (and already applied in this process) there is nothing to do.
    if (
      !force &&
      this.appliedThisProcess &&
      this.lastSyncedAt &&
      Date.now() - Date.parse(this.lastSyncedAt) < DEFAULT_INTERVAL_MS
    ) {
      return this.skipped();
    }
    // A sync is already running. Non-forced callers just piggyback on its
    // outcome; a forced caller (manual refresh) waits for it and then runs
    // anyway so the user's explicit request always hits the network.
    if (this.inFlight) {
      if (!force) return this.skipped();
      await this.inFlight.catch(() => undefined);
    }
    const run = this.runSync();
    this.inFlight = run;
    try {
      return await run;
    } finally {
      if (this.inFlight === run) this.inFlight = null;
    }
  }

  private async runSync(): Promise<CatalogSyncResult> {
    try {
      const { normalized, meta, fetchedAt } = await this.fetchLive();
      this.writeCache(meta, fetchedAt);
      return this.apply(normalized, fetchedAt, "network");
    } catch (networkErr) {
      console.error(`[yzpz-agent] catalog: live fetch failed (${networkErr}); trying cache`);
      const cached = this.readCache();
      if (cached && !this.appliedThisProcess) {
        return this.apply(modelsFromRaw(cached.raw), cached.fetchedAt, "cache");
      }
      return this.skipped();
    }
  }

  private skipped(): CatalogSyncResult {
    return {
      syncedAt: this.lastSyncedAt,
      providersAdded: [],
      modelsAdded: [],
      skippedProviders: 0,
      source: "skipped",
    };
  }

  private async fetchLive(): Promise<{
    normalized: Record<string, CatalogModelMap>;
    meta: Record<string, ModelsDevProviderMeta>;
    fetchedAt: string;
  }> {
    const metaResponse = await fetch(MODELS_DEV_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!metaResponse.ok) throw new Error(`models.dev responded ${metaResponse.status}`);
    const meta = (await metaResponse.json()) as Record<string, ModelsDevProviderMeta>;
    // The SDK helper does its own fetch + normalization of the same endpoint.
    const normalizedSdk = await Llms.fetchModelsDevProviderModels(MODELS_DEV_URL);
    const normalized: Record<string, CatalogModelMap> = {};
    for (const [providerId, models] of Object.entries(normalizedSdk ?? {})) {
      normalized[providerId] = models as CatalogModelMap;
    }
    return { normalized, meta, fetchedAt: new Date().toISOString() };
  }

  /**
   * Additive-only merge into the shared Llms registry.
   */
  private apply(
    providers: Record<string, CatalogModelMap>,
    syncedAt: string,
    source: "network" | "cache",
  ): CatalogSyncResult {
    const result: CatalogSyncResult = {
      syncedAt,
      providersAdded: [],
      modelsAdded: [],
      skippedProviders: 0,
      source,
    };

    let knownIds: string[] = [];
    try {
      knownIds = Llms.getProviderIds();
    } catch (err) {
      console.error(`[yzpz-agent] catalog: registry unavailable: ${err}`);
      return result;
    }

    for (const [providerId, liveModels] of Object.entries(providers ?? {})) {
      const modelIds = Object.keys(liveModels ?? {});
      if (modelIds.length === 0) continue;

      if (knownIds.includes(providerId)) {
        // Known provider: add only the model ids it is missing.
        let currentKeys: Record<string, unknown> = {};
        try {
          currentKeys = (Llms.getModelsForProvider(providerId) ??
            {}) as unknown as Record<string, unknown>;
        } catch {
          currentKeys = {};
        }
        for (const modelId of modelIds) {
          if (Object.hasOwn(currentKeys, modelId)) continue;
          const info = { ...liveModels[modelId], id: modelId };
          try {
            Llms.registerModel(providerId, modelId, info as never);
            result.modelsAdded.push({ providerId, modelId });
          } catch (err) {
            console.error(`[yzpz-agent] catalog: registerModel ${providerId}/${modelId} failed: ${err}`);
          }
        }
        continue;
      }

      // Brand-new provider: register only when mappable to a client with a baseUrl.
      const meta = providers === null ? undefined : this.metaCache?.[providerId];
      const mapping = mapClient(meta?.npm);
      const baseUrl = str(meta?.api);
      if (!mapping || !baseUrl) {
        result.skippedProviders += 1;
        continue;
      }
      const entries = Object.entries(liveModels);
      const sorted =
        meta && typeof meta === "object"
          ? [...entries].sort((a, b) => {
              const da = str(a[1]?.releaseDate) ?? "";
              const db = str(b[1]?.releaseDate) ?? "";
              return db.localeCompare(da);
            })
          : entries;
      const defaultModelId = sorted[0]?.[0];
      if (!defaultModelId) {
        result.skippedProviders += 1;
        continue;
      }
      const collection = {
        provider: {
          id: providerId,
          name: str(meta?.name) ?? providerId,
          description: str(meta?.doc),
          protocol: mapping.protocol,
          baseUrl,
          env: Array.isArray(meta?.env)
            ? (meta.env as unknown[]).filter((e): e is string => typeof e === "string")
            : undefined,
          defaultModelId,
          client: mapping.client,
        },
        models: liveModels,
      };
      try {
        Llms.registerProvider(collection as never);
        result.providersAdded.push(providerId);
      } catch (err) {
        result.skippedProviders += 1;
        console.error(`[yzpz-agent] catalog: registerProvider ${providerId} failed: ${err}`);
      }
    }

    this.appliedThisProcess = true;
    this.lastSyncedAt = syncedAt;

    const total =
      result.providersAdded.length + result.modelsAdded.length;
    console.log(
      `[yzpz-agent] catalog: ${source} sync at ${syncedAt}: +${result.providersAdded.length} providers, ` +
        `+${result.modelsAdded.length} models, ${result.skippedProviders} skipped`,
    );
    if (total > 0) {
      try {
        this.sink?.("catalog-updated", {
          syncedAt: result.syncedAt,
          providersAdded: result.providersAdded,
          modelsAdded: result.modelsAdded,
          skippedProviders: result.skippedProviders,
          source: result.source,
        });
      } catch (err) {
        console.error(`[yzpz-agent] catalog: event emit failed: ${err}`);
      }
    }
    return result;
  }

  /** Provider metadata captured alongside the last successful fetch. */
  private metaCache: Record<string, ModelsDevProviderMeta> | null = null;

  private cachePath(): string {
    return join(this.dataDir, "catalog-cache.json");
  }

  private writeCache(
    meta: Record<string, ModelsDevProviderMeta>,
    fetchedAt: string,
  ): void {
    try {
      mkdirSync(this.dataDir, { recursive: true });
      this.metaCache = meta;
      const payload: CacheFile = { version: CACHE_VERSION, fetchedAt, raw: meta };
      writeFileSync(this.cachePath(), JSON.stringify(payload));
    } catch (err) {
      console.error(`[yzpz-agent] catalog: cache write failed: ${err}`);
    }
  }

  private readCache(): CacheFile | undefined {
    const path = this.cachePath();
    if (!existsSync(path)) return undefined;
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as CacheFile;
      if (parsed.version !== CACHE_VERSION || !parsed.raw) return undefined;
      this.metaCache = parsed.raw;
      return parsed;
    } catch (err) {
      console.error(`[yzpz-agent] catalog: cache read failed: ${err}`);
      return undefined;
    }
  }
}
