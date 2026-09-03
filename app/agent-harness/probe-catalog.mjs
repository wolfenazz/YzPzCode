// Live catalog sync smoke probe (T1.4): exercises CatalogSync end-to-end
// against the real models.dev catalog, verifying the frozen contract shape and
// that live additions and metadata refreshes reach the shared Llms registry.
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

const result = await sync.sync({ force: true });
check("result has syncedAt (string|null)", result.syncedAt === null || typeof result.syncedAt === "string", JSON.stringify(result.syncedAt));
check("result has providersAdded array", Array.isArray(result.providersAdded));
check("result has modelsAdded array of {providerId,modelId}", Array.isArray(result.modelsAdded) && result.modelsAdded.every((m) => typeof m.providerId === "string" && typeof m.modelId === "string"));
check("result has modelsUpdated array of {providerId,modelId}", Array.isArray(result.modelsUpdated) && result.modelsUpdated.every((m) => typeof m.providerId === "string" && typeof m.modelId === "string"));
check("result has skippedProviders number", typeof result.skippedProviders === "number");
check("source is network|cache|skipped", ["network", "cache", "skipped"].includes(result.source), result.source);
console.log(`  [info] source=${result.source} syncedAt=${result.syncedAt} +providers=${result.providersAdded.length} +models=${result.modelsAdded.length} refreshed=${result.modelsUpdated.length} skipped=${result.skippedProviders}`);

// (b) Live additions/refreshes reach the shared registry. Do not pin this probe
// to one preview model: models.dev legitimately removes preview ids over time.
const after = await Llms.getModelsForProvider("opencode");
check("opencode present in registry after sync", (await Llms.getProviderIds()).includes("opencode"));
check("opencode model count grew or live model present", Object.keys(after ?? {}).length >= Object.keys(beforeCount ?? {}).length, `before=${Object.keys(beforeCount ?? {}).length} after=${Object.keys(after ?? {}).length}`);
const changed = [...result.modelsAdded, ...result.modelsUpdated];
check("sync reports at least one model addition or refresh", changed.length > 0);
const sample = changed[0];
const sampleModels = sample ? await Llms.getModelsForProvider(sample.providerId) : {};
check("registry reflects a reported model change", !!sample && Object.hasOwn(sampleModels ?? {}, sample.modelId), sample ? `${sample.providerId}/${sample.modelId}` : "no sample");

// (c) Cache persisted for offline boot.
check("catalog-cache.json written", existsSync(join(dataDir, "catalog-cache.json")));

// (d) A second force sync must not remove anything and must not crash;
// within-TTL non-force sync returns "skipped".
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