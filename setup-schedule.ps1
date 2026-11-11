# One-time setup for Windows: creates a Task Scheduler task that runs run-daily.ps1 every morning.
# Run once from this folder:
#   powershell -ExecutionPolicy Bypass -File .\setup-schedule.ps1
# To change the time, edit $time and run this again. To remove the task:
#   Unregister-ScheduledTask -TaskName "Cruise price tracker" -Confirm:$false

$time = "6:17AM"
$script = Join-Path $PSScriptRoot "run-daily.ps1"

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`"" `
    -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -Daily -At $time
# StartWhenAvailable: if the computer was off or asleep at the scheduled time,
# run as soon as it's back on instead of skipping the day.
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 1)

Register-ScheduledTask -TaskName "Cruise price tracker" -Action $action -Trigger $trigger `
    -Settings $settings -Description "Daily inside-cabin prices for Icon, Star and Legend of the Seas" -Force

Write-Host "Scheduled 'Cruise price tracker' to run daily at $time."
