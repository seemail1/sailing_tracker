// Daily inside-cabin price collector.
// Reads ships.json, fetches each upcoming sailing's Gangwaze page, and records
// today's lowest inside-cabin price in data/<ship>/prices.csv (one file per ship).
// Node 20+, no dependencies.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

const DELAY_MS = 3000;            // pause between requests, to be polite
const RETRY_DELAY_MS = 15000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; personal-cruise-price-tracker/1.0; one request every 3s, once a day)";
const HEADER = [
  "scrape_date", "sail_date", "nights", "days_before",
  "inside_price_usd", "price_per_night_usd", "status", "url",
];

const config = JSON.parse(readFileSync(new URL("./ships.json", import.meta.url)));
const today = new Date().toLocaleDateString("en-CA"); // local date, YYYY-MM-DD
const onlyShip = process.argv[2]; // optional: node scrape.mjs icon-of-the-seas

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

export function parsePrice(html) {
  const clean = (s) =>
    s.replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;|&#160;/gi, " ")
      .replace(/&#36;|&dollar;/gi, "$")
      .replace(/&amp;/gi, "&")
      .replace(/\s+/g, " ");
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const re =
    /most recent price for this sailing starts at \$\s?([\d,]+(?:\.\d+)?)\s*\(\s*\$\s?([\d,]+(?:\.\d+)?)\s*per night\s*\)\s*for an? inside cabin/i;
  for (const text of [clean(withoutScripts), clean(html)]) {
    const m = text.match(re);
    if (m) {
      const num = (s) => Number(s.replace(/,/g, ""));
      return { status: "ok", price: num(m[1]), perNight: num(m[2]) };
    }
  }
  if (/this cruise has sailed/i.test(clean(withoutScripts))) return { status: "sailed" };
  return { status: "no_price" };
}

async function fetchPage(url) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
        redirect: "follow",
        signal: AbortSignal.timeout(30000),
      });
      if (res.status === 404) return { status: "not_found" };
      // Blocked or rate-limited: don't retry, so a blocked run ends quickly.
      if (res.status === 429 || res.status === 403) return { status: `blocked: HTTP ${res.status}`, blocked: true };
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { html: await res.text() };
    } catch (err) {
      if (attempt === 2) return { status: `error: ${err.message}`.replace(/,/g, ";") };
      await sleep(RETRY_DELAY_MS);
    }
  }
}

function readCsv(path) {
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf8").trim().split("\n").slice(1);
  return lines.filter(Boolean).map((l) => l.split(","));
}

async function main() {
  let attempted = 0, priced = 0, blockedInARow = 0;
  for (const ship of config.ships) {
    if (onlyShip && ship.slug !== onlyShip) continue;
    const dir = `data/${ship.slug}`;
    mkdirSync(dir, { recursive: true });
    const path = `${dir}/prices.csv`;
    // Drop any rows already recorded today, so a re-run replaces them instead of duplicating.
    const rows = readCsv(path).filter((r) => r[0] !== today);

    const upcoming = ship.sailings.filter((s) => s.date >= today);
    console.log(`\n${ship.name}: ${upcoming.length} upcoming sailings`);
    for (const s of upcoming) {
      const url = config.source
        .replace("{ship}", ship.slug).replace("{date}", s.date).replace("{nights}", s.nights);
      const page = await fetchPage(url);
      const result = page.html ? parsePrice(page.html) : { status: page.status };
      attempted++;
      if (result.status === "ok") priced++;
      blockedInARow = page.blocked ? blockedInARow + 1 : 0;
      rows.push([
        today, s.date, s.nights, daysBetween(today, s.date),
        result.price ?? "", result.perNight ?? "", result.status, url,
      ]);
      console.log(`  ${s.date} (${s.nights}n): ${result.status === "ok" ? "$" + result.price : result.status}`);
      if (blockedInARow >= 3) break;
      await sleep(DELAY_MS);
    }
    rows.sort((a, b) => (a[1] + a[0]).localeCompare(b[1] + b[0]));
    writeFileSync(path, [HEADER, ...rows].map((r) => r.join(",")).join("\n") + "\n");
    if (blockedInARow >= 3) {
      console.error("\nThe site refused 3 requests in a row (HTTP 429/403). Stopping this run.");
      process.exit(1);
    }
  }
  console.log(`\nPriced ${priced} of ${attempted} sailings.`);
  // Fail the run (so GitHub emails you) if most pages could not be read:
  // that usually means the site changed its layout or blocked the request.
  if (attempted > 0 && priced / attempted < 0.5) {
    console.error("Fewer than half of the sailings returned a price. Check the site.");
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
