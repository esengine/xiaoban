import type { ModelInfo } from "@xiaoban/protocol";

const BRANDS: Record<string, string> = {
  deepseek: "DeepSeek",
  mimo: "MiMo",
  gpt: "GPT",
  qwen: "Qwen",
  glm: "GLM",
  claude: "Claude",
  gemini: "Gemini",
  kimi: "Kimi",
};

export function modelName(model: string): string {
  return model
    .split(/[-_\s/]+/)
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase();
      const brand = BRANDS[lower];
      if (brand) return brand;
      if (/^v\d/.test(lower)) return lower.toUpperCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

export function activeModelName(info: ModelInfo): string {
  return info.label ?? modelName(info.model);
}
