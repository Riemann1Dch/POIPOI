# Kill existing 派派 pet process
$petProcesses = Get-Process -Name "electron" -ErrorAction SilentlyContinue | Where-Object { 
    try { $_.MainWindowTitle -like "*派派*" -or $_.MainWindowTitle -like "*PoiPoi*" } catch { $false }
}

if (-not $petProcesses) {
    # Fallback: find by window title via Get-Process with MainWindowHandle
    $procs = Get-Process -Name "electron" -ErrorAction SilentlyContinue
    foreach ($p in $procs) {
        $title = $p.MainWindowTitle
        if ($title -match "派派" -or $title -match "PoiPoi") {
            Write-Host "Found 派派 process PID=$($p.Id), title=$title"
            $petProcesses += $p
        }
    }
}

if ($petProcesses) {
    foreach ($p in $petProcesses) {
        Write-Host "Stopping 派派 PID=$($p.Id)..."
        $p.Kill()
        Start-Sleep -Milliseconds 200
    }
    Start-Sleep -Seconds 1
}

# Navigate to pet directory and start
$petDir = $PSScriptRoot
Set-Location $petDir
Write-Host "Starting 派派..."
Start-Process cmd -ArgumentList "/c cd /d $petDir && npm start"
Write-Host "Done!"
