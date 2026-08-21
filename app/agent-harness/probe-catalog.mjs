// Live catalog sync smoke probe (T1.4): exercises CatalogSync end-to-end
// against the real models.dev catalog, verifying the frozen contract shape and
// that a known live-only model (opencode x-preview-f-free) reaches the shared
// Llms registry ADDITIVELY.
//   node probe-catalog.mjs   (after `npm run build`)
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Llms } from "@cline/sdk";
import { CatalogSync } from "./dist/catalog-sync.js";

let failures = 0;
function check(name, cond, detail = "") {
  if (cond) {
    console.log(`  [ok] ${name}`);
  } else {
    failures += 1;
    console.log(`  [FAIL] ${name} ${detail}`);
  }
}

const dataDir = mkdtempSync(join(tmpdir(), "yzpz-catalog-probe-"));
const sync = new CatalogSync(dataDir);

// (a) Frozen contract shape (context.md #1): exact keys + union source.
const before = await Llms.getProviderIds();
const beforeCount = (await Llms.getModelsForProvider("opencode")) ?? {};
const beforeHasLive = Object.hasOwn(beforeCount, "x-preview-f-free");

const result = await sync.sync({ force: true });
check("result has syncedAt (string|null)", result.syncedAt === null || typeof result.syncedAt === "string", JSON.stringify(result.syncedAt));
check("result has providersAdded array", Array.isArray(result.providersAdded));
check("result has modelsAdded array of {providerId,modelId}", Array.isArray(result.modelsAdded) && result.modelsAdded.every((m) => typeof m.providerId === "string" && typeof m.modelId === "string"));
check("result has skippedProviders number", typeof result.skippedProviders === "number");
check("source is network|cache|skipped", ["network", "cache", "skipped"].includes(result.source), result.source);
console.log(`  [info] source=${result.source} syncedAt=${result.syncedAt} +providers=${result.providersAdded.length} +models=${result.modelsAdded.length} skipped=${result.skippedProviders}`);

// (b) The live-only model reaches the shared registry (additive gain).
const after = await Llms.getModelsForProvider("opencode");
check("opencode present in registry after sync", (await Llms.getProviderIds()).includes("opencode"));
check("opencode model count grew or live model present", Object.keys(after ?? {}).length >= Object.keys(beforeCount ?? {}).length, `before=${Object.keys(beforeCount ?? {}).length} after=${Object.keys(after ?? {}).length}`);
const gained = Object.hasOwn(after ?? {}, "x-preview-f-free");
check("opencode gains x-preview-f-free", gained, "x-preview-f-free missing after sync");
check("modelsAdded includes x-preview-f-free (or it pre-existed)", result.modelsAdded.some((m) => m.providerId === "opencode" && m.modelId === "x-preview-f-free") || beforeHasLive, JSON.stringify(result.modelsAdded));
check("registry reflects the addition via getModelsForProvider", gained);

// (c) Cache persisted for offline boot.
check("catalog-cache.json written", existsSync(join(dataDir, "catalog-cache.json")));

// (d) Additive-only: a second force sync must not remove anything and must not
// crash; within-TTL non-force sync returns "skipped".
const second = await sync.sync({ force: true });
const after2 = await Llms.getModelsForProvider("opencode");
check("second sync keeps every model (no removals)", Object.keys(after2 ?? {}).length >= Object.keys(after ?? {}).length, `after=${Object.keys(after ?? {}).length} after2=${Object.keys(after2 ?? {}).length}`);
const ttl = await sync.sync({ force: false });
check("non-force sync within TTL returns skipped", ttl.source === "skipped", ttl.source);

// (e) Brand-new provider registration path (when mappable + baseUrl): at least
// one models.dev-only provider may be registered; never throws.
check("no throw across repeated syncs", true);

rmSync(dataDir, { recursive: true, force: true });
if (failures === 0) {
  console.log("\nprobe-catalog: ALL PASS");
} else {
  console.log(`\nprobe-catalog: ${failures} FAILURE(S)`);
  process.exitCode = 1;
}