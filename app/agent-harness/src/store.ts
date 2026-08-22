import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { OAuthCredentials } from "@cline/sdk";

export interface ProviderConfigEntry {
  providerId: string;
  apiKey?: string;
  baseUrl?: string;
  modelId?: string;
  /**
   * OAuth credentials for providers that authenticate via a browser flow
   * (e.g. `openai-codex`). Kept alongside the key so a single store drives both
   * auth methods; the renderer never receives the raw secret.
   */
  oauth?: OAuthCredentials | null;
}

/**
 * A blank field from a partial settings save means "leave the saved value
 * alone", not "erase the credential". Credentials are deliberately removed
 * through `clear`, which makes this distinction unambiguous at every caller.
 */
const nonBlank = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();
  return normalized || undefined;
};

// Simple, self-owned persistence for provider credentials. Kept in the YZPZ
// Agent data dir (not OS keychain) for the MVP. Never logged.
export class ProviderConfigStore {
  private file: string;
  private configs: Record<string, ProviderConfigEntry> = {};

  constructor(dataDir: string) {
    // 0700 so the directory (and the secrets inside it) stay user-private.
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    this.file = join(dataDir, "providers.json");
    this.load();
  }

  private load(): void {
    try {
      if (existsSync(this.file)) {
        this.configs = JSON.parse(readFileSync(this.file, "utf8"));
      }
    } catch {
      this.configs = {};
    }
  }

  private save(): void {
    try {
      // Provider API keys are secrets: 0600, never world-readable.
      writeFileSync(this.file, JSON.stringify(this.configs, null, 2), { mode: 0o600 });
      chmodSync(this.file, 0o600); // also tighten a file created before this fix
    } catch (err) {
      console.warn(`[yzpz-agent] failed to persist provider config: ${err}`);
    }
  }

  set(entry: ProviderConfigEntry): void {
    const existing = this.configs[entry.providerId] || {};
    const apiKey = nonBlank(entry.apiKey);
    const baseUrl = nonBlank(entry.baseUrl);
    const modelId = nonBlank(entry.modelId);
    this.configs[entry.providerId] = {
      providerId: entry.providerId,
      apiKey: apiKey ?? existing.apiKey,
      baseUrl: baseUrl ?? existing.baseUrl,
      modelId: modelId ?? existing.modelId,
      oauth: entry.oauth !== undefined ? entry.oauth : existing.oauth,
    };
    this.save();
  }

  get(providerId: string): ProviderConfigEntry | undefined {
    return this.configs[providerId];
  }

  list(): ProviderConfigEntry[] {
    return Object.values(this.configs);
  }

  clear(providerId: string): void {
    delete this.configs[providerId];
    this.save();
  }

  /** Overwrite only the OAuth credentials for a provider (login flow). */
  setOAuth(providerId: string, oauth: OAuthCredentials | null): void {
    const entry = this.configs[providerId] ?? { providerId };
    entry.oauth = oauth;
    this.configs[providerId] = entry;
    this.save();
  }

  /** Drop a provider's OAuth credentials without touching its api-key config. */
  clearOAuth(providerId: string): void {
    const entry = this.configs[providerId];
    if (entry) {
      entry.oauth = null;
      this.save();
    }
  }
}
