import { describe, expect, it } from "vitest";
import { getModelPricing, setManualPricing } from "./pricing";

describe("pricing lookup", () => {
  it("finds OpenAI catalog pricing by exact model", () => {
    const pricing = getModelPricing("gpt-5.4");
    expect(pricing.source).toBe("catalog");
    expect(pricing.provider).toBe("openai");
    expect(pricing.inputUsdPerMillion).toBe(2.5);
    expect(pricing.cachedInputUsdPerMillion).toBe(0.25);
    expect(pricing.outputUsdPerMillion).toBe(15);
  });

  it("finds Claude catalog pricing with dashed version aliases", () => {
    const pricing = getModelPricing("claude-sonnet-4-6-20260101");
    expect(pricing.source).toBe("catalog");
    expect(pricing.provider).toBe("anthropic");
    expect(pricing.inputUsdPerMillion).toBe(3);
    expect(pricing.cachedInputUsdPerMillion).toBe(0.3);
    expect(pricing.outputUsdPerMillion).toBe(15);
  });

  it("keeps manual rates in memory for later lookups", () => {
    const manual = setManualPricing({
      model: "local-test-model",
      inputUsdPerMillion: 1.25,
      cachedInputUsdPerMillion: null,
      outputUsdPerMillion: 2.5
    });
    expect(manual.source).toBe("manual");

    const pricing = getModelPricing("local-test-model");
    expect(pricing.source).toBe("manual");
    expect(pricing.inputUsdPerMillion).toBe(1.25);
    expect(pricing.cachedInputUsdPerMillion).toBeNull();
    expect(pricing.outputUsdPerMillion).toBe(2.5);
  });
});
