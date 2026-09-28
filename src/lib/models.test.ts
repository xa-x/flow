import { describe, expect, it } from "vitest";
import {
  filterModels,
  groupModels,
  modelName,
  providerOf,
  splitModelLabel,
  type ModelInfo,
} from "./models";

const model = (
  id: string,
  label: string,
  outputs?: ModelInfo["outputs"],
): ModelInfo => ({ id, label, outputs });

describe("providerOf", () => {
  it("treats an alias id as the same vendor", () => {
    expect(providerOf("~z-ai/glm-flash-latest")).toBe("z-ai");
    expect(providerOf("z-ai/glm-5.3")).toBe("z-ai");
  });
});

describe("splitModelLabel", () => {
  it("splits a vendor-prefixed label", () => {
    expect(splitModelLabel("Z.ai: GLM Flash Latest")).toEqual({
      vendor: "Z.ai",
      name: "GLM Flash Latest",
    });
  });

  it("leaves an unprefixed label alone", () => {
    expect(splitModelLabel("Claude Sonnet 4.5")).toEqual({
      vendor: "",
      name: "Claude Sonnet 4.5",
    });
  });

  it("keeps later colons in the model name", () => {
    expect(splitModelLabel("Venice: Uncensored: Free").name).toBe(
      "Uncensored: Free",
    );
  });

  it("falls back to the id when a label is only a vendor", () => {
    expect(modelName(model("a/b", "Vendor: "))).toBe("a/b");
  });
});

describe("groupModels", () => {
  it("puts alias and plain ids of one vendor in a single group", () => {
    const groups = groupModels([
      model("~z-ai/glm-flash-latest", "Z.ai: GLM Flash Latest"),
      model("z-ai/glm-5.3", "Z.ai: GLM 5.3"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Z.ai");
    expect(groups[0].items).toHaveLength(2);
  });

  it("names a group from the provider label when no vendor is given", () => {
    const groups = groupModels([model("openai/gpt-5.2", "GPT-5.2")]);
    expect(groups[0].label).toBe("OpenAI");
  });

  it("falls back to the raw slug for unknown vendors", () => {
    const groups = groupModels([model("who/what", "What")]);
    expect(groups[0].label).toBe("who");
  });

  it("merges two slugs owned by one vendor", () => {
    const groups = groupModels([
      model("meta-llama/llama-4", "Meta: Llama 4"),
      model("meta/muse", "Meta: Muse"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Meta");
    expect(groups[0].items).toHaveLength(2);
  });

  it("takes the vendor name most models of a slug agree on", () => {
    const groups = groupModels([
      model("newco/a", "NewCo: A"),
      model("newco/b", "Odd Alias: B"),
      model("newco/c", "NewCo: C"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("NewCo");
  });

  it("prefers the curated name over a stray provider label", () => {
    // OpenRouter labels some x-ai models "SpaceXAI"; the group stays "xAI"
    const groups = groupModels([
      model("x-ai/odd", "SpaceXAI: Odd One"),
      model("x-ai/grok-4", "SpaceXAI: Grok 4"),
    ]);
    expect(groups[0].label).toBe("xAI");
  });

  it("emits no duplicate group labels", () => {
    const groups = groupModels([
      model("meta-llama/a", "Meta: A"),
      model("meta/b", "Meta: B"),
      model("openai/c", "OpenAI: C"),
    ]);
    const labels = groups.map((g) => g.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("filterModels", () => {
  it("keeps declared outputs over the id heuristic", () => {
    // "audio-mini" reads like a speech model, but the provider says text
    const models = [model("openai/gpt-audio-mini-chat", "Chat", ["text"])];
    expect(filterModels(models, "chat")).toHaveLength(1);
    expect(filterModels(models, "audio")).toHaveLength(0);
  });

  it("routes each modality to its own node kind", () => {
    const models = [
      model("a/chat", "Chat", ["text"]),
      model("a/img", "Img", ["image"]),
      model("a/tts", "TTS", ["audio"]),
      model("a/vid", "Vid", ["video"]),
    ];
    expect(filterModels(models, "chat").map((m) => m.id)).toEqual(["a/chat"]);
    expect(filterModels(models, "image").map((m) => m.id)).toEqual(["a/img"]);
    expect(filterModels(models, "audio").map((m) => m.id)).toEqual(["a/tts"]);
    expect(filterModels(models, "video").map((m) => m.id)).toEqual(["a/vid"]);
  });

  it("still guesses for models that declare nothing", () => {
    const models = [model("bfl/flux.2-klein", "FLUX.2 Klein")];
    expect(filterModels(models, "image")).toHaveLength(1);
    expect(filterModels(models, "chat")).toHaveLength(0);
  });
});
