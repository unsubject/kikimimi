import { describe, it, expect } from "vitest";
import { decideStage } from "../src/learner.js";

describe("scaffold graduation (spec §8)", () => {
  const strong = Array(10).fill(85);

  it("graduates S1→S2 when all conditions are met", () => {
    const d = decideStage(strong, 1, 20, 10);
    expect(d.action).toBe("graduate");
    expect(d.toStage).toBe(2);
  });

  it("holds when time-at-stage is too short", () => {
    expect(decideStage(strong, 1, 10, 10).action).toBe("hold");
  });

  it("holds when too few items at stage", () => {
    expect(decideStage(strong, 1, 20, 5).action).toBe("hold");
  });

  it("holds when trailing mean is below 80", () => {
    expect(decideStage(Array(10).fill(70), 1, 20, 10).action).toBe("hold");
  });

  it("never graduates past S3", () => {
    expect(decideStage(strong, 3, 40, 20).action).toBe("hold");
  });

  it("de-graduates when trailing mean drops below 55", () => {
    const d = decideStage([40, 50, 45, 30], 2, 30, 12);
    expect(d.action).toBe("degrade");
    expect(d.toStage).toBe(1);
  });

  it("does not de-graduate below S1", () => {
    expect(decideStage([10, 20, 30], 1, 30, 12).action).toBe("hold");
  });
});
