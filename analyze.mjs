// Analyses the collected prices, separately for each ship.
// For each ship, writes:
//   results/<ship>/sailings.csv  one row per sailing (opens in Excel)
//   results/<ship>/report.md     how far before sailing the lowest inside price tends to appear
// Node 20+, no dependencies.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

// A sailing counts toward "when did the lowest price appear" only if we watched it
// from at least this many days out; otherwise a lower price may have come before we started.
const MIN_TRACKED_DAYS = 120;

const BUCKETS = [
  [0, 7], [8, 14], [15, 30], [31, 60], [61, 90],
  [91, 120], [121, 180], [181, 270], [271, Infinity],
];
const label = ([a, b]) => (b === Infinity ? `${a}+ days` : `${a}–${b} days`);
const bucketOf = (d) => BUCKETS.findIndex(([a, b]) => d >= a && d <= b);
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const pct = (x) => (x == null ? "–" : `${(x * 100).toFixed(1)}%`);
const usd = (x) => (x == null ? "–" : `$${Math.round(x).toLocaleString("en-US")}`);

const config = JSON.parse(readFileSync(new URL("./ships.json", import.meta.url)));
const today = new Date().toISOString().slice(0, 10);

function loadRows(slug) {
  const path = `data/${slug}/prices.csv`;
  if (!existsSync(path)) return [];
  const [head, ...lines] = readFileSync(path, "utf8").trim().split("\n");
  const cols = head.split(",");
  return lines.filter(Boolean).map((l) => {
    const v = l.split(","), r = Object.fromEntries(cols.map((c, i) => [c, v[i]]));
    return { ...r, days_before: Number(r.days_before), price: r.inside_price_usd ? Number(r.inside_price_usd) : null };
  });
}

export function analyzeShip(rows, asOf = today) {
  const bySailing = new Map();
  for (const r of rows) {
    if (r.status !== "ok" || r.price == null) continue;
    if (!bySailing.has(r.sail_date)) bySailing.set(r.sail_date, []);
    bySailing.get(r.sail_date).push(r);
  }

  const sailings = [];
  for (const [sail_date, obs] of [...bySailing].sort()) {
    obs.sort((a, b) => b.days_before - a.days_before); // earliest observation first
    const low = Math.min(...obs.map((o) => o.price));
    const atLow = obs.filter((o) => o.price === low);
    const first = obs[0], latest = obs[obs.length - 1];
    sailings.push({
      sail_date,
      nights: first.nights,
      observations: obs.length,
      tracked_from_days_before: first.days_before,
      lowest_price: low,
      lowest_first_days_before: atLow[0].days_before,
      lowest_last_days_before: atLow[atLow.length - 1].days_before,
      latest_price: latest.price,
      latest_days_before: latest.days_before,
      sailed: sail_date < asOf,
      // If the lowest price was already showing on our first day of tracking,
      // the true lowest may have been offered before we started collecting.
      lowest_may_be_earlier: atLow[0].days_before === first.days_before,
      obs,
    });
  }

  // How each sailing's price compares with its own lowest, by days before sailing.
  // Averaged per sailing first, so sailings with more observations don't dominate.
  const curve = BUCKETS.map(() => []);
  for (const s of sailings) {
    if (s.observations < 2) continue;
    const per = BUCKETS.map(() => []);
    for (const o of s.obs) per[bucketOf(o.days_before)].push(o.price / s.lowest_price - 1);
    per.forEach((xs, i) => xs.length && curve[i].push(mean(xs)));
  }

  const settled = sailings.filter(
    (s) => s.sailed && !s.lowest_may_be_earlier && s.tracked_from_days_before >= MIN_TRACKED_DAYS);
  const sailedAll = sailings.filter((s) => s.sailed);
  const lowBuckets = BUCKETS.map(() => 0);
  for (const s of settled) lowBuckets[bucketOf(s.lowest_first_days_before)]++;

  return { sailings, settled, sailedAll, curve, lowBuckets };
}

function writeShip(ship, rows) {
  const dir = `results/${ship.slug}`;
  mkdirSync(dir, { recursive: true });
  const { sailings, settled, sailedAll, curve, lowBuckets } = analyzeShip(rows);
  const days = [...new Set(rows.map((r) => r.scrape_date))].sort();

  const csvCols = [
    "sail_date", "nights", "observations", "tracked_from_days_before",
    "lowest_price", "lowest_first_days_before", "lowest_last_days_before",
    "latest_price", "latest_days_before", "sailed", "lowest_may_be_earlier",
  ];
  writeFileSync(`${dir}/sailings.csv`,
    [csvCols.join(","), ...sailings.map((s) => csvCols.map((c) => s[c]).join(","))].join("\n") + "\n");

  const md = [];
  md.push(`# ${ship.name}: inside cabin price timing`, "");
  md.push(`Updated ${today}. ${days.length} day(s) of data (${days[0] ?? "–"} to ${days.at(-1) ?? "–"}), ` +
    `${sailings.length} sailings with prices, ${sailings.filter((s) => s.sailed).length} already sailed.`, "");

  md.push("## When did the lowest price first appear?", "");
  md.push(`Counts only sailings that have already sailed, were tracked from at least ${MIN_TRACKED_DAYS} days out, ` +
    "and whose lowest price showed up *after* tracking began. Sailings that miss any of these may have had a lower " +
    "price before collection started, so they are left out.", "");
  if (settled.length) {
    const d = settled.map((s) => s.lowest_first_days_before);
    md.push(`**${settled.length} sailings.** Median: **${median(d)} days** before sailing. ` +
      `Mean: ${mean(d).toFixed(0)} days. Range: ${Math.min(...d)}–${Math.max(...d)} days.`, "");
    md.push("| Days before sailing | Sailings whose lowest price first appeared here |", "|---|---|");
    BUCKETS.forEach((b, i) => md.push(`| ${label(b)} | ${lowBuckets[i]} |`));
  } else {
    md.push(`_Not enough data yet. This fills in as sailings tracked from ${MIN_TRACKED_DAYS}+ days out depart ` +
      "(the first ones are in spring 2027)._");
  }
  if (sailedAll.length) {
    const d = sailedAll.map((s) => s.lowest_first_days_before);
    md.push("", `For reference, all ${sailedAll.length} sailed sailings, including short-tracked ones: median ${median(d)} days.`);
  }
  md.push("");

  md.push("## Price compared with each sailing's own lowest, by days before sailing", "");
  md.push("0% means the price was at that sailing's lowest observed level. Uses every sailing with 2+ days of data, " +
    "including ones that haven't sailed yet (their lowest may still drop, so read early results loosely).", "");
  md.push("| Days before sailing | Average premium over lowest | Sailings with data |", "|---|---|---|");
  BUCKETS.forEach((b, i) => md.push(`| ${label(b)} | ${pct(mean(curve[i]))} | ${curve[i].length} |`));
  const best = curve.map((xs, i) => [mean(xs), i]).filter(([m]) => m != null).sort((a, b) => a[0] - b[0])[0];
  if (best) md.push("", `Cheapest window so far, relative to each sailing's lowest: **${label(BUCKETS[best[1]])}** before sailing.`);
  md.push("");

  md.push("## Each sailing", "");
  md.push("| Sail date | Nights | Days tracked | Lowest | Lowest first seen (days before) | Latest | Sailed | Lowest may be earlier |",
    "|---|---|---|---|---|---|---|---|");
  for (const s of sailings)
    md.push(`| ${s.sail_date} | ${s.nights} | ${s.observations} | ${usd(s.lowest_price)} | ${s.lowest_first_days_before} | ` +
      `${usd(s.latest_price)} | ${s.sailed ? "yes" : "no"} | ${s.lowest_may_be_earlier ? "yes" : "no"} |`);
  md.push("", "Prices are the lowest inside-cabin fare shown on Gangwaze (usually per person, double occupancy, in USD).", "");
  writeFileSync(`${dir}/report.md`, md.join("\n"));
  console.log(`${ship.name}: ${sailings.length} sailings analysed -> ${dir}/`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const ship of config.ships) writeShip(ship, loadRows(ship.slug));
}
