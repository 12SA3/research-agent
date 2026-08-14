import { describe, expect, it } from "vitest";
import { evaluationSchema, researchPlanSchema, searchToolArgumentsSchema } from "../src/server/research/schemas.js";

describe("research schemas", () => {
  it("接受 2 到 4 个有效计划步骤", () => {
    const result = researchPlanSchema.parse({ steps: [
      { id: "step-1", title: "共同要求", query: "这些 JD 的共同技能要求" },
      { id: "step-2", title: "差异分析", query: "不同岗位的差异化要求" },
    ] });
    expect(result.steps).toHaveLength(2);
  });

  it("拒绝未知或空工具参数", () => {
    expect(() => searchToolArgumentsSchema.parse({ query: "" })).toThrow();
    expect(searchToolArgumentsSchema.parse({ query: "React 性能要求" }).query).toBe("React 性能要求");
  });

  it("限制评估器最多两个补充查询", () => {
    expect(() => evaluationSchema.parse({ sufficient: false, additionalQueries: ["a1", "a2", "a3"] })).toThrow();
  });
});
