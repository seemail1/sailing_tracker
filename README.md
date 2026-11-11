# Cruise price tracker: Icon, Star and Legend of the Seas

This tracker runs once a day on GitHub Actions at no cost. Each run records the lowest inside-cabin price for every upcoming sailing of three ships, for sailings departing up to September 1, 2027. Each ship's data and results are kept separate. Prices come from each sailing's page on gangwaze.com.

## What's in here

| Path | What it is |
|---|---|
| `ships.json` | The sailings to track for each ship (date and number of nights) |
| `scrape.mjs` | Collects today's prices and adds them to `data/<ship>/prices.csv` |
| `analyze.mjs` | Writes `results/<ship>/report.md` and `results/<ship>/sailings.csv` |
| `.github/workflows/daily-prices.yml` | Runs both scripts every day at 10:17 UTC and saves the results to the repo |

Each ship has its own folders: `data/icon-of-the-seas/`, `data/star-of-the-seas/`, `data/legend-of-the-seas/`, and the same three under `results/`.

## Setup (about 5 minutes)

1. Create a new **private** repository on GitHub. A free account works: private repos get 2,000 Actions minutes a month, and this job uses about 7 minutes a day.
2. Upload every file in this folder, including the hidden `.github` folder. Uploading through the browser can skip hidden folders. If that happens, create `.github/workflows/daily-prices.yml` with **Add file → Create new file** and paste in its contents.
3. Open **Actions**, choose **Daily cruise prices**, and click **Run workflow** to test it once. When it finishes, you should see a new commit containing `data/` and `results/`.
4. If the run fails at the "Save data" step with a permission error, go to **Settings → Actions → General → Workflow permissions**, choose **Read and write permissions**, and run it again.

After that it runs every day by itself. If a run fails, for example because fewer than half the pages returned a price, GitHub emails you.

## Reading the results

Open `results/<ship>/report.md` on GitHub. It has three sections:

- **When did the lowest price first appear?** This is the main answer: the median number of days before sailing, plus a breakdown by range. It counts only sailings that have already departed and that were tracked from at least 120 days out. Otherwise a lower price might have come before tracking started. The first sailings that qualify depart in spring 2027, so this section stays empty until then.
- **Price compared with each sailing's own lowest.** For each range of days before sailing, this shows how far above its lowest price a sailing typically was. It starts showing useful patterns after a few weeks.
- **Each sailing.** One row per sailing. The same data is in `sailings.csv`, which opens in Excel.

You can also open `data/<ship>/prices.csv` in Excel to see every daily price.

## Maintenance

- **Sailings added or changed:** edit `ships.json`. Each entry is `{ "date": "YYYY-MM-DD", "nights": N }`, and the number of nights must match the page's web address on Gangwaze. To track beyond September 1, 2027, add more dates.
- **Run it on your own computer:** `node scrape.mjs`, then `node analyze.mjs`. This needs Node 20 or newer and nothing else. `node scrape.mjs icon-of-the-seas` collects prices for one ship only.
- **If prices stop appearing:** Gangwaze may have changed its wording. The scraper looks for the sentence "The most recent price for this sailing starts at $X ($Y per night) for an Inside cabin." Update the pattern in `parsePrice()` in `scrape.mjs`.

Gangwaze updates its prices about once a day, so a price can be up to a day old. The "starts at" price is usually per person, based on two people sharing a cabin, in USD.
