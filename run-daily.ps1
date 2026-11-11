# Daily run for Windows: collect today's prices, update the results, and push them to GitHub.
# Task Scheduler runs this file (see setup-schedule.ps1). You can also run it by hand:
#   powershell -ExecutionPolicy Bypass -File .\run-daily.ps1

Set-Location -Path $PSScriptRoot
$log = Join-Path $PSScriptRoot "run-log.txt"
function Log($msg) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $msg" | Tee-Object -FilePath $log -Append }

Log "Starting run"
git pull --rebase --quiet 2>&1 | ForEach-Object { Log "git: $_" }

node scrape.mjs *>&1 | Tee-Object -FilePath $log -Append
$scrapeExit = $LASTEXITCODE
node analyze.mjs *>&1 | Tee-Object -FilePath $log -Append

git add data results
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
    git commit --quiet -m "Prices for $(Get-Date -Format 'yyyy-MM-dd')"
    git push --quiet 2>&1 | ForEach-Object { Log "git: $_" }
    Log "Saved and pushed"
} else {
    Log "No new data to save"
}

if ($scrapeExit -ne 0) { Log "Price collection reported a problem (exit code $scrapeExit). See above." }
Log "Done"
exit $scrapeExit
