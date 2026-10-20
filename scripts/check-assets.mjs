#!/usr/bin/env node
/**
 * Verifies that every page really serves its assets.
 *
 * A page can return HTTP 200 while all of its JavaScript and CSS return 404
 * (this happened when a production build overwrote the dev server's output
 * directory). The browser then shows an unstyled, broken page.
 *
 * This script starts the server, requests every route and checks that every
 * referenced /_next/static asset is reachable.
 *
 * Usage:  node scripts/check-assets.mjs [baseUrl]
 */

import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const BASE_URL = process.argv[2] ?? "http://localhost:3000";

const ROUTES = [
  "/",
  "/pricing",
  "/documents",
  "/settings",
  "/templates",
  "/notifications",
  "/billing/checkout?plan=plus&cycle=monthly",
];

const ASSET_PATTERN = /\/_next\/static\/[A-Za-z0-9/_.-]+\.(js|css)/g;

const fetchText = async (url) => {
  const response = await fetch(url, { redirect: "follow" });
  return { status: response.status, body: await response.text() };
};

const startServer = async () => {
  const child = spawn("npm", ["run", "dev"], {
    env: { ...process.env, PORT: "3000" },
    stdio: "ignore",
    detached: true,
  });
  child.unref();

  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(BASE_URL, { redirect: "follow" });
      if (response.status < 500) return;
    } catch {
      // not up yet
    }
    await sleep(1000);
  }
  throw new Error("The development server did not start in time");
};

const main = async () => {
  let server = null;
  if (!process.env.SKIP_SERVER_START) {
    console.log("→ starting the development server…");
    server = await startServer();
  }

  let failures = 0;

  for (const route of ROUTES) {
    const url = `${BASE_URL}${route}`;
    let page;
    try {
      page = await fetchText(url);
    } catch (error) {
      console.error(`✗ ${route} — ${error.message}`);
      failures += 1;
      continue;
    }

    if (page.status !== 200) {
      console.error(`✗ ${route} — the page returned ${page.status}`);
      failures += 1;
      continue;
    }

    const assets = [...new Set(page.body.match(ASSET_PATTERN) ?? [])];
    const missing = [];

    for (const asset of assets) {
      const response = await fetch(`${BASE_URL}${asset}`, {
        redirect: "follow",
      });
      if (response.status !== 200) {
        missing.push(`${asset} (${response.status})`);
      }
    }

    if (missing.length > 0) {
      console.error(`✗ ${route} — ${missing.length} missing asset(s)`);
      for (const asset of missing) console.error(`    ${asset}`);
      failures += 1;
    } else {
      console.log(`✓ ${route} — ${assets.length} assets OK`);
    }
  }

  if (server) {
    try {
      process.kill(-server.pid);
    } catch {
      // the server may already be gone
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} route(s) failed.`);
    process.exit(1);
  }

  console.log("\nEvery route serves all of its assets. ✅");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
