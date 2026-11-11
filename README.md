# Cruise price tracker: Icon, Star and Legend of the Seas

This tracker runs once a day on your own computer. Each run records the lowest inside-cabin price for every upcoming sailing of three ships, for sailings departing up to September 1, 2027. Each ship's data and results are kept separate. After every run, the results are pushed to this GitHub repo. Prices come from each sailing's page on gangwaze.com.

It doesn't run on GitHub Actions: Gangwaze answers requests from GitHub's servers with HTTP 429, and home internet connections normally aren't blocked.

## What's in here

| Path | What it is |
|---|---|
| `ships.json` | The sailings to track for each ship (date and number of nights) |
| `scrape.mjs` | Collects today's prices and adds them to `data/<ship>/prices.csv` |
| `analyze.mjs` | Writes `results/<ship>/report.md` and `results/<ship>/sailings.csv` |
| `run-daily.ps1` | Windows: runs both scripts, then commits and pushes the results |
| `setup-schedule.ps1` | Windows: one-time setup of the daily Task Scheduler task |
| `run-daily.sh` | macOS/Linux version of `run-daily.ps1`, for use with cron |

Each ship has its own folders: `data/icon-of-the-seas/`, `data/star-of-the-seas/`, `data/legend-of-the-seas/`, and the same three under `results/`. Each run is also logged to `run-log.txt`, which stays on your computer and isn't pushed.

## Setup on Windows (about 5 minutes)

You need [Node.js](https://nodejs.org) 20 or newer and [Git for Windows](https://git-scm.com/download/win). Git for Windows remembers your GitHub sign-in, so the scheduled runs can push.

1. Clone the repo somewhere permanent, for example `C:\Users\<you>\sailing_tracker`:
   ```powershell
   git clone https://github.com/seemail1/sailing_tracker.git
   cd sailing_tracker
   ```
2. Test it once by hand. This takes about 8 minutes:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\run-daily.ps1
   ```
   You should see a price for each sailing, and a new "Prices for …" commit on GitHub. If Git asks you to sign in, do it once and it's remembered.
3. Schedule it:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\setup-schedule.ps1
   ```
   This creates a task called **Cruise price tracker** that runs daily at 6:17 a.m. If the computer is off or asleep at that time, the task runs as soon as the computer is back on. You can see the task in Task Scheduler, and you can run it from there with **Run**.

Missed days are fine. They're just gaps in the data, and the analysis handles them.

## Setup on macOS or Linux

Clone the repo, run `./run-daily.sh` once to test it, then add a cron line with `crontab -e`:

```
17 6 * * * /full/path/to/sailing_tracker/run-daily.sh
```

## Reading the results

Open `results/<ship>/report.md` on GitHub. It has three sections:

- **When did the lowest price first appear?** This is the main answer: the median number of days before sailing, plus a breakdown by range. It counts only sailings that have already departed and that were tracked from at least 120 days out. Otherwise a lower price might have come before tracking started. The first sailings that qualify depart in spring 2027, so this section stays empty until then.
- **Price compared with each sailing's own lowest.** For each range of days before sailing, this shows how far above its lowest price a sailing typically was. It starts showing useful patterns after a few weeks.
- **Each sailing.** One row per sailing. The same data is in `sailings.csv`, which opens in Excel.

You can also open `data/<ship>/prices.csv` in Excel to see every daily price.

## Maintenance

- **Sailings added or changed:** edit `ships.json`. Each entry is `{ "date": "YYYY-MM-DD", "nights": N }`, and the number of nights must match the page's web address on Gangwaze. To track beyond September 1, 2027, add more dates.
- **One ship only:** `node scrape.mjs icon-of-the-seas`.
- **If a run reports a problem:** check `run-log.txt`. If the site refuses 3 requests in a row (HTTP 429/403), the run stops early. If prices stop appearing, Gangwaze may have changed its wording. The scraper looks for the sentence "The most recent price for this sailing starts at $X ($Y per night) for an Inside cabin." Update the pattern in `parsePrice()` in `scrape.mjs`.

Gangwaze updates its prices about once a day, so a price can be up to a day old. The "starts at" price is usually per person, based on two people sharing a cabin, in USD.
