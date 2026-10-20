import { describe, expect, it } from "vitest";
import { evaluateFormula, validateFormula } from "@/lib/formula";

const scope = {
  Price: 10,
  Qty: 3,
  Done: false,
  Name: "Website",
  "First name": "Ada",
  "Last name": "Lovelace",
};

describe("formula engine", () => {
  it("evaluates arithmetic", () => {
    expect(evaluateFormula("1 + 2 * 3", {})).toBe(7);
    expect(evaluateFormula("(1 + 2) * 3", {})).toBe(9);
    expect(evaluateFormula("10 / 4", {})).toBe(2.5);
    expect(evaluateFormula("10 % 3", {})).toBe(1);
  });

  it("reads properties by name", () => {
    expect(evaluateFormula('prop("Price") * prop("Qty")', scope)).toBe(30);
    expect(evaluateFormula('prop("Price") > 5', scope)).toBe(true);
  });

  it("reads properties with spaces", () => {
    expect(
      evaluateFormula('concat(prop("First name"), " ", prop("Last name"))', scope),
    ).toBe("Ada Lovelace");
  });

  it("supports conditionals", () => {
    expect(
      evaluateFormula('if(prop("Done") == 1, "Shipped", "In progress")', scope),
    ).toBe("In progress");
    expect(evaluateFormula('if(prop("Price") > 5, "big", "small")', scope)).toBe(
      "big",
    );
  });

  it("supports string helpers", () => {
    expect(evaluateFormula('lower(prop("Name"))', scope)).toBe("website");
    expect(evaluateFormula('upper(prop("Name"))', scope)).toBe("WEBSITE");
    expect(evaluateFormula('length(prop("Name"))', scope)).toBe(7);
    expect(evaluateFormula('contains(prop("Name"), "web")', scope)).toBe(true);
  });

  it("supports numeric helpers", () => {
    expect(evaluateFormula("round(10 / 3)", scope)).toBe(3);
    expect(evaluateFormula("abs(-4)", scope)).toBe(4);
    expect(evaluateFormula("sum(prop(\"Price\"), prop(\"Qty\"))", scope)).toBe(13);
    expect(evaluateFormula("max(1, 9, 4)", scope)).toBe(9);
  });

  it("concatenates with &", () => {
    expect(evaluateFormula('prop("Name") & "!"', scope)).toBe("Website!");
  });

  it("returns null for broken formulas instead of throwing", () => {
    expect(evaluateFormula("prop(", scope)).toBeNull();
    expect(evaluateFormula("unknownFunction(1)", scope)).toBeNull();
    expect(evaluateFormula("", scope)).toBeNull();
  });

  it("validates formulas", () => {
    expect(validateFormula('prop("Price") * 2').valid).toBe(true);
    expect(validateFormula("prop(").valid).toBe(false);
    expect(validateFormula("").valid).toBe(false);
  });
});
