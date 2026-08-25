import { describe, expect, it } from "vitest";
import { normalizeUploadFilename } from "../src/server/documents/filename.js";

const chineseFileNames = [
  "01_项目开发画像与数字孪生成熟度评估.pdf",
  "02_Agent在3D前端研发中的应用价值与边界.pdf",
  "03_Agent辅助开发架构与工作流落地方案.md",
  "04_3D前端Agent测试评估与质量门禁.md",
  "05_Agent与数字孪生风险治理清单.txt",
  "06_九十天试点路线图与投入产出评估.txt",
];

describe("upload filename normalization", () => {
  it.each(chineseFileNames)("修复 multipart Latin-1 误解码：%s", (fileName) => {
    const mojibake = Buffer.from(fileName, "utf8").toString("latin1");
    expect(normalizeUploadFilename(mojibake)).toBe(fileName);
  });

  it("保留已经正确的中文和ASCII文件名", () => {
    expect(normalizeUploadFilename(chineseFileNames[0])).toBe(chineseFileNames[0]);
    expect(normalizeUploadFilename("agent-evaluation.md")).toBe("agent-evaluation.md");
  });

  it("不破坏无法安全还原的Latin-1文件名", () => {
    expect(normalizeUploadFilename("résumé.txt")).toBe("résumé.txt");
  });
});
