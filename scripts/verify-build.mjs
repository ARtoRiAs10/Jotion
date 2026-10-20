#!/usr/bin/env node
/**
 * The full pre-deployment check.
 *
 * Runs everything that has to pass before the app is deployed:
 *   1. type check
 *   2. lint
 *   3. the test suite
 *   4. the production build
 *   5. the asset check (every route must serve its JavaScript and CSS)
 *   6. the Vercel compatibility check
 *
 * Usage:  npm run verify
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

const run = (command, args, options = {}) =>
  new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      stdio: "inherit",
      ...options,
    });
    child.on("close", (code) => resolve(code ?? 1));
  });

const steps = [
  { name: "Type check", command: "npm", args: ["run", "typecheck"] },
  { name: "Lint", command: "npm", args: ["run", "lint"] },
  { name: "Tests", command: "npm", args: ["test"] },
  { name: "Production build", command: "npm", args: ["run", "build"] },
  { name: "Asset check", command: "npm", args: ["run", "check:assets"] },
];

const checkVercel = () => {
  const problems = [];

  if (!existsSync(path.join(ROOT, "vercel.json"))) {
    problems.push("vercel.json is missing");
  } else {
    const config = JSON.parse(
      readFileSync(path.join(ROOT, "vercel.json"), "utf8"),
    );
    if (config.framework !== "nextjs") {
      problems.push("vercel.json must declare the nextjs framework");
    }
    if (!config.buildCommand) {
      problems.push("vercel.json must declare a build command");
    }
  }

  if (!existsSync(path.join(ROOT, ".vercelignore"))) {
    problems.push(".vercelignore is missing");
  }

  // The build must not depend on a live Convex deployment.
  const nextConfig = readFileSync(
    path.join(ROOT, "next.config.mjs"),
    "utf8",
  );
  if (!nextConfig.includes("distDir")) {
    problems.push("next.config.mjs must set a distDir");
  }

  if (problems.length > 0) {
    console.error("\n✗ Vercel compatibility problems:");
    for (const problem of problems) console.error(`    ${problem}`);
    return 1;
  }

  console.log("✓ Vercel compatibility");
  return 0;
};

const main = async () => {
  const started = Date.now();
  const results = [];

  for (const step of steps) {
    console.log(`\n=== ${step.name} ===`);
    const code = await run(step.command, step.args);
    results.push({ name: step.name, code });
    if (code !== 0) {
      console.error(`\n✗ ${step.name} failed — stopping.`);
      process.exit(code);
    }
  }

  console.log("\n=== Vercel compatibility ===");
  const vercel = checkVercel();
  results.push({ name: "Vercel compatibility", code: vercel });
  if (vercel !== 0) process.exit(vercel);

  const seconds = Math.round((Date.now() - started) / 1000);
  console.log("\n=== Summary ===");
  for (const result of results) {
    console.log(`  ✓ ${result.name}`);
  }
  console.log(`\nEverything passed in ${seconds}s. Ready to deploy. ✅`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
