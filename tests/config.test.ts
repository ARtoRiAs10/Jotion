import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { resolveSearchParams } from "@/hooks/use-safe-search-params";

const root = path.resolve(__dirname, "..");
const config = readFileSync(path.join(root, "next.config.mjs"), "utf8");

describe("build configuration", () => {
  it("uses a separate output directory for the dev server", () => {
    // Running `npm run build` while `npm run dev` is running used to replace
    // the dev server's assets, which made every page load without its
    // JavaScript and CSS (404 on /_next/static/*).
    expect(config).toMatch(/distDir/);
    expect(config).toMatch(/\.next-dev/);
  });

  it("ignores the dev output directory in git", () => {
    const gitignore = readFileSync(path.join(root, ".gitignore"), "utf8");
    expect(gitignore).toContain("/.next-dev/");
  });
});

describe("search parameters", () => {
  it("never returns null — that used to crash the page", () => {
    // Next.js returns null from useSearchParams() while a route is
    // statically rendered. Calling .get() on it threw
    // "Cannot read properties of null (reading 'get')".
    const params = resolveSearchParams(null, "tab=billing&plan=plus");
    expect(params).not.toBeNull();
    expect(params.get("tab")).toBe("billing");
    expect(params.get("plan")).toBe("plus");
  });

  it("passes real parameters through", () => {
    const real = new URLSearchParams("a=1");
    expect(resolveSearchParams(real)).toBe(real);
  });

  it("uses no parameters when there is nothing to work with", () => {
    expect(resolveSearchParams(undefined, "").get("x")).toBeNull();
  });
});

describe("continuous integration", () => {
  it("has a workflow that runs the full verification", () => {
    const workflow = readFileSync(
      path.join(root, ".github/workflows/ci.yml"),
      "utf8",
    );
    // `npm run verify` runs the type check, the lint, the tests, the build and
    // the asset check.
    expect(workflow).toContain("npm run verify");
  });

  it("checks the type check, the lint, the tests and the build", () => {
    const verifier = readFileSync(
      path.join(root, "scripts/verify-build.mjs"),
      "utf8",
    );
    expect(verifier).toContain('["run", "typecheck"]');
    expect(verifier).toContain('["run", "lint"]');
    expect(verifier).toContain('["test"]');
    expect(verifier).toContain('["run", "build"]');
    expect(verifier).toContain("check:assets");
  });

  it("has a deployment workflow", () => {
    const workflow = readFileSync(
      path.join(root, ".github/workflows/deploy.yml"),
      "utf8",
    );
    expect(workflow).toContain("npx convex deploy");
    expect(workflow).toContain("vercel-action");
  });
});
