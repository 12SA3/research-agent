import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT || 3001),
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || "",
    baseUrl: (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, ""),
    model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
  },
  xunfei: {
    apiKey: process.env.XUNFEI_API_KEY || "",
    baseUrl: (process.env.XUNFEI_BASE_URL || "https://maas-api.cn-huabei-1.xf-yun.com/v2").replace(/\/$/, ""),
    embeddingModel: process.env.XUNFEI_EMBEDDING_MODEL || "",
    rerankModel: process.env.XUNFEI_RERANK_MODEL || "",
  },
};

export function assertConfigured(name: string, value: string): void {
  if (!value) {
    throw new Error(`${name} 未配置，请检查 .env`);
  }
}
