import type { ModelPricing, ModelPricingProvider, ModelPricingUpdate, PricingResponse } from "../shared/types";

const CATALOG_UPDATED_AT = "2026-06-17";
const OPENAI_PRICING_URL = "https://developers.openai.com/api/docs/pricing";
const ANTHROPIC_PRICING_URL = "https://platform.claude.com/docs/en/about-claude/pricing";

type CatalogEntry = {
  provider: Exclude<ModelPricingProvider, "unknown">;
  inputUsdPerMillion: number;
  cachedInputUsdPerMillion: number | null;
  outputUsdPerMillion: number;
  sourceUrl: string;
  notes?: string[];
};

const exactCatalog = new Map<string, CatalogEntry>([
  ["gpt-5.5", { provider: "openai", inputUsdPerMillion: 5, cachedInputUsdPerMillion: 0.5, outputUsdPerMillion: 30, sourceUrl: OPENAI_PRICING_URL }],
  ["gpt-5.4", { provider: "openai", inputUsdPerMillion: 2.5, cachedInputUsdPerMillion: 0.25, outputUsdPerMillion: 15, sourceUrl: OPENAI_PRICING_URL }],
  ["gpt-5.4-mini", { provider: "openai", inputUsdPerMillion: 0.75, cachedInputUsdPerMillion: 0.075, outputUsdPerMillion: 4.5, sourceUrl: OPENAI_PRICING_URL }],
  ["gpt-5.4-nano", { provider: "openai", inputUsdPerMillion: 0.2, cachedInputUsdPerMillion: 0.02, outputUsdPerMillion: 1.25, sourceUrl: OPENAI_PRICING_URL }],
  ["gpt-5.3-codex", { provider: "openai", inputUsdPerMillion: 1.75, cachedInputUsdPerMillion: 0.175, outputUsdPerMillion: 14, sourceUrl: OPENAI_PRICING_URL }],
  ["chat-latest", { provider: "openai", inputUsdPerMillion: 5, cachedInputUsdPerMillion: 0.5, outputUsdPerMillion: 30, sourceUrl: OPENAI_PRICING_URL }],
  ["claude-fable-5", { provider: "anthropic", inputUsdPerMillion: 10, cachedInputUsdPerMillion: 1, outputUsdPerMillion: 50, sourceUrl: ANTHROPIC_PRICING_URL }],
  ["claude-mythos-5", { provider: "anthropic", inputUsdPerMillion: 10, cachedInputUsdPerMillion: 1, outputUsdPerMillion: 50, sourceUrl: ANTHROPIC_PRICING_URL, notes: ["Limited availability model."] }],
  ["claude-opus-4.8", { provider: "anthropic", inputUsdPerMillion: 5, cachedInputUsdPerMillion: 0.5, outputUsdPerMillion: 25, sourceUrl: ANTHROPIC_PRICING_URL }],
  ["claude-opus-4.7", { provider: "anthropic", inputUsdPerMillion: 5, cachedInputUsdPerMillion: 0.5, outputUsdPerMillion: 25, sourceUrl: ANTHROPIC_PRICING_URL }],
  ["claude-opus-4.6", { provider: "anthropic", inputUsdPerMillion: 5, cachedInputUsdPerMillion: 0.5, outputUsdPerMillion: 25, sourceUrl: ANTHROPIC_PRICING_URL }],
  ["claude-opus-4.5", { provider: "anthropic", inputUsdPerMillion: 5, cachedInputUsdPerMillion: 0.5, outputUsdPerMillion: 25, sourceUrl: ANTHROPIC_PRICING_URL }],
  ["claude-opus-4.1", { provider: "anthropic", inputUsdPerMillion: 15, cachedInputUsdPerMillion: 1.5, outputUsdPerMillion: 75, sourceUrl: ANTHROPIC_PRICING_URL, notes: ["Deprecated model pricing."] }],
  ["claude-opus-4", { provider: "anthropic", inputUsdPerMillion: 15, cachedInputUsdPerMillion: 1.5, outputUsdPerMillion: 75, sourceUrl: ANTHROPIC_PRICING_URL, notes: ["Retired model pricing except on selected partner platforms."] }],
  ["claude-sonnet-4.6", { provider: "anthropic", inputUsdPerMillion: 3, cachedInputUsdPerMillion: 0.3, outputUsdPerMillion: 15, sourceUrl: ANTHROPIC_PRICING_URL }],
  ["claude-sonnet-4.5", { provider: "anthropic", inputUsdPerMillion: 3, cachedInputUsdPerMillion: 0.3, outputUsdPerMillion: 15, sourceUrl: ANTHROPIC_PRICING_URL }],
  ["claude-sonnet-4", { provider: "anthropic", inputUsdPerMillion: 3, cachedInputUsdPerMillion: 0.3, outputUsdPerMillion: 15, sourceUrl: ANTHROPIC_PRICING_URL, notes: ["Retired model pricing except on selected partner platforms."] }],
  ["claude-haiku-4.5", { provider: "anthropic", inputUsdPerMillion: 1, cachedInputUsdPerMillion: 0.1, outputUsdPerMillion: 5, sourceUrl: ANTHROPIC_PRICING_URL }],
  ["claude-haiku-3.5", { provider: "anthropic", inputUsdPerMillion: 0.8, cachedInputUsdPerMillion: 0.08, outputUsdPerMillion: 4, sourceUrl: ANTHROPIC_PRICING_URL, notes: ["Retired model pricing except on selected partner platforms."] }]
]);

const manualPricing = new Map<string, ModelPricing>();
const lookupCache = new Map<string, ModelPricing>();

export const normalizePricingModel = (model: string): string => (
  model
    .trim()
    .toLowerCase()
    .replace(/^models\//, "")
    .replace(/_/g, "-")
    .replace(/\s+/g, "-")
    .replace(/--+/g, "-")
);

const withoutDateSuffix = (normalized: string): string => (
  normalized
    .replace(/-\d{4}-\d{2}-\d{2}$/, "")
    .replace(/-\d{8}$/, "")
);

const decimalClaudeVersion = (normalized: string): string => (
  normalized
    .replace(/claude-(fable|mythos|opus|sonnet|haiku)-(\d)-(\d)(?=$|-)/, "claude-$1-$2.$3")
    .replace(/claude-(\d)-(\d)-(opus|sonnet|haiku)/, "claude-$3-$1.$2")
    .replace(/claude-(\d)-(opus|sonnet|haiku)/, "claude-$2-$1")
);

const catalogKeyFor = (normalized: string): string => {
  const candidates = [
    normalized,
    decimalClaudeVersion(normalized),
    withoutDateSuffix(normalized),
    decimalClaudeVersion(withoutDateSuffix(normalized))
  ];
  for (const candidate of candidates) {
    if (exactCatalog.has(candidate)) return candidate;
  }
  return normalized;
};

const modelPricingFromCatalog = (model: string, normalizedModel: string, entry: CatalogEntry): ModelPricing => ({
  model,
  normalizedModel,
  provider: entry.provider,
  source: "catalog",
  inputUsdPerMillion: entry.inputUsdPerMillion,
  cachedInputUsdPerMillion: entry.cachedInputUsdPerMillion,
  outputUsdPerMillion: entry.outputUsdPerMillion,
  sourceUrl: entry.sourceUrl,
  notes: entry.notes ?? [],
  updatedAt: CATALOG_UPDATED_AT,
  cachedAt: new Date().toISOString()
});

const missingPricing = (model: string, normalizedModel: string): ModelPricing => ({
  model,
  normalizedModel,
  provider: normalizedModel.includes("claude") ? "anthropic" : normalizedModel.startsWith("gpt-") || normalizedModel.startsWith("o") ? "openai" : "unknown",
  source: "missing",
  inputUsdPerMillion: null,
  cachedInputUsdPerMillion: null,
  outputUsdPerMillion: null,
  sourceUrl: null,
  notes: ["Enter rates to estimate this model for the current server session."],
  updatedAt: null,
  cachedAt: new Date().toISOString()
});

export const getModelPricing = (model: string): ModelPricing => {
  const normalizedModel = normalizePricingModel(model);
  const manual = manualPricing.get(normalizedModel);
  if (manual) return { ...manual, model };

  const cached = lookupCache.get(normalizedModel);
  if (cached) return { ...cached, model };

  const catalogKey = catalogKeyFor(normalizedModel);
  const catalogEntry = exactCatalog.get(catalogKey);
  const pricing = catalogEntry
    ? modelPricingFromCatalog(model, normalizedModel, catalogEntry)
    : missingPricing(model, normalizedModel);
  lookupCache.set(normalizedModel, pricing);
  return pricing;
};

export const getPricingForModels = (models: string[]): PricingResponse => {
  const seen = new Set<string>();
  const rates: ModelPricing[] = [];
  for (const model of models.map((item) => item.trim()).filter(Boolean)) {
    const normalizedModel = normalizePricingModel(model);
    if (seen.has(normalizedModel)) continue;
    seen.add(normalizedModel);
    rates.push(getModelPricing(model));
  }
  return { rates };
};

const finiteRate = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value)) && Number(value) >= 0) return Number(value);
  return null;
};

export const setManualPricing = (update: ModelPricingUpdate): ModelPricing => {
  const normalizedModel = normalizePricingModel(update.model);
  const inputUsdPerMillion = finiteRate(update.inputUsdPerMillion);
  const cachedInputUsdPerMillion = update.cachedInputUsdPerMillion === null ? null : finiteRate(update.cachedInputUsdPerMillion);
  const outputUsdPerMillion = finiteRate(update.outputUsdPerMillion);

  if (!normalizedModel || inputUsdPerMillion === null || outputUsdPerMillion === null) {
    throw new Error("Model, input price, and output price are required.");
  }

  const existing = getModelPricing(update.model);
  const pricing: ModelPricing = {
    model: update.model,
    normalizedModel,
    provider: existing.provider,
    source: "manual",
    inputUsdPerMillion,
    cachedInputUsdPerMillion,
    outputUsdPerMillion,
    sourceUrl: null,
    notes: ["Manual rate stored in memory for this API server session."],
    updatedAt: new Date().toISOString(),
    cachedAt: new Date().toISOString()
  };
  manualPricing.set(normalizedModel, pricing);
  lookupCache.set(normalizedModel, pricing);
  return pricing;
};
