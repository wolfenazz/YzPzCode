import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface ProviderConfigEntry {
  providerId: string;
  apiKey?: string;
  baseUrl?: string;
  modelId?: string;
}

// Simple, self-owned persistence for provider credentials. Kept in the YZPZ
// Agent data dir (not OS keychain) for the MVP. Never logged.
export class ProviderConfigStore {
  private file: string;
  private configs: Record<string, ProviderConfigEntry> = {};

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
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
      writeFileSync(this.file, JSON.stringify(this.configs, null, 2), "utf8");
    } catch (err) {
      console.warn(`[yzpz-agent] failed to persist provider config: ${err}`);
    }
  }

  set(entry: ProviderConfigEntry): void {
    const existing = this.configs[entry.providerId] || {};
    this.configs[entry.providerId] = {
      providerId: entry.providerId,
      apiKey: entry.apiKey ?? existing.apiKey,
      baseUrl: entry.baseUrl ?? existing.baseUrl,
      modelId: entry.modelId ?? existing.modelId,
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
}
