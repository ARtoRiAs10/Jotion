import { describe, expect, it } from "vitest";
import { buildQuote } from "@/lib/plans";

describe("smoke", () => {
  it("computes a quote", () => {
    expect(buildQuote({ planId: "plus", cycle: "monthly", seats: 2 }).total).toBe(2400);
  });
});
