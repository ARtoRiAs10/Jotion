import { describe, expect, it } from "vitest";
import {
  COUPONS,
  annualSavingsPercent,
  buildQuote,
  discountFor,
  formatMoney,
  getPlan,
  planChangePreview,
  priceFor,
  remainingFraction,
  subscriptionTotal,
  toCents,
  validateCoupon,
} from "@/lib/plans";

describe("plan catalogue", () => {
  it("exposes four plans with prices for both cycles", () => {
    expect(["free", "plus", "business", "enterprise"]).toEqual(
      ["free", "plus", "business", "enterprise"].filter((id) => getPlan(id)),
    );
    expect(priceFor("plus", "monthly")).toBe(12);
    expect(priceFor("plus", "annual")).toBe(10);
    expect(priceFor("enterprise", "monthly")).toBeNull();
  });

  it("computes the annual saving", () => {
    expect(annualSavingsPercent(getPlan("plus"))).toBe(17);
    expect(annualSavingsPercent(getPlan("business"))).toBe(17);
  });

  it("charges per seat", () => {
    // 3 seats on the monthly Plus plan
    expect(subscriptionTotal("plus", "monthly", 3)).toBe(3600);
    // 3 seats on the annual Plus plan — 12 months up front
    expect(subscriptionTotal("plus", "annual", 3)).toBe(36000);
    // the free plan is free
    expect(subscriptionTotal("free", "monthly", 10)).toBe(0);
  });
});

describe("buildQuote", () => {
  it("computes subtotal, tax and total", () => {
    const quote = buildQuote({
      planId: "plus",
      cycle: "monthly",
      seats: 2,
      taxRate: 0.2,
    });
    expect(quote.subtotal).toBe(2400);
    expect(quote.tax).toBe(480);
    expect(quote.total).toBe(2880);
    expect(quote.unitPrice).toBe(1200);
  });

  it("bills twelve months for the annual cycle", () => {
    const quote = buildQuote({ planId: "plus", cycle: "annual", seats: 1 });
    expect(quote.subtotal).toBe(12000);
    expect(quote.periodDays).toBe(365);
  });

  it("applies a percentage promo code", () => {
    const quote = buildQuote({
      planId: "plus",
      cycle: "monthly",
      seats: 1,
      couponCode: "JOTION20",
    });
    expect(quote.discount).toBe(240);
    expect(quote.total).toBe(960);
    expect(quote.couponValid).toBe(true);
  });

  it("applies a fixed promo code", () => {
    const quote = buildQuote({
      planId: "plus",
      cycle: "monthly",
      seats: 1,
      couponCode: "WELCOME10",
    });
    expect(quote.discount).toBe(1000);
    expect(quote.total).toBe(200);
  });

  it("rejects a promo code that does not apply to the plan", () => {
    const quote = buildQuote({
      planId: "free",
      cycle: "monthly",
      seats: 1,
      couponCode: "EDU50",
    });
    expect(quote.couponValid).toBe(false);
    expect(quote.discount).toBe(0);
  });

  it("never discounts below zero", () => {
    const quote = buildQuote({
      planId: "free",
      cycle: "monthly",
      seats: 1,
      couponCode: "WELCOME10",
    });
    expect(quote.total).toBe(0);
  });
});

describe("coupons", () => {
  it("validates the built-in coupons", () => {
    expect(validateCoupon("JOTION20", "plus").valid).toBe(true);
    expect(validateCoupon("jotion20", "plus").valid).toBe(true);
    expect(validateCoupon("NOPE", "plus").valid).toBe(false);
    expect(validateCoupon("EDU50", "free").valid).toBe(false);
  });

  it("caps the discount at the subtotal", () => {
    const coupon = COUPONS.find((c) => c.code === "WELCOME10")!;
    expect(discountFor(500, coupon)).toBe(500);
  });
});

describe("proration", () => {
  it("computes the remaining fraction of a period", () => {
    const start = 1_000_000;
    const end = start + 30 * 24 * 60 * 60 * 1000;
    const half = start + (end - start) / 2;
    expect(remainingFraction(start, end, start)).toBeCloseTo(1, 5);
    expect(remainingFraction(start, end, half)).toBeCloseTo(0.5, 5);
    expect(remainingFraction(start, end, end + 1000)).toBe(0);
  });

  it("previews an upgrade as a prorated charge", () => {
    const preview = planChangePreview({
      from: "plus",
      to: "business",
      cycle: "monthly",
      seats: 2,
      fraction: 0.5,
    });
    expect(preview.isUpgrade).toBe(true);
    expect(preview.credit).toBe(1200); // 2 seats * $12 * 0.5
    expect(preview.charge).toBe(2400); // 2 seats * $24 * 0.5
    expect(preview.dueToday).toBe(1200);
  });

  it("previews a downgrade as costing nothing today", () => {
    const preview = planChangePreview({
      from: "business",
      to: "plus",
      cycle: "monthly",
      seats: 2,
      fraction: 0.5,
    });
    expect(preview.isUpgrade).toBe(false);
    expect(preview.dueToday).toBe(0);
  });
});

describe("money", () => {
  it("formats cents", () => {
    expect(formatMoney(0)).toBe("$0");
    expect(formatMoney(1200)).toBe("$12");
    expect(formatMoney(1250)).toBe("$12.50");
  });

  it("converts dollars to cents", () => {
    expect(toCents(12)).toBe(1200);
    expect(toCents(12.5)).toBe(1250);
  });
});
