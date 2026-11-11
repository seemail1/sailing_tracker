#!/usr/bin/env bash
# Daily run for macOS/Linux: collect today's prices, update the results, and push them to GitHub.
# Schedule with cron (crontab -e), for example every day at 6:17 a.m.:
#   17 6 * * * /path/to/sailing_tracker/run-daily.sh
cd "$(dirname "$0")" || exit 1
exec >> run-log.txt 2>&1
echo "$(date '+%F %T')  Starting run"
git pull --rebase --quiet
node scrape.mjs; scrape_exit=$?
node analyze.mjs
git add data results
if ! git diff --cached --quiet; then
  git commit --quiet -m "Prices for $(date +%F)" && git push --quiet && echo "Saved and pushed"
else
  echo "No new data to save"
fi
echo "$(date '+%F %T')  Done (exit $scrape_exit)"
exit $scrape_exit
