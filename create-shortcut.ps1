$desktop = [Environment]::GetFolderPath('Desktop')
$petDir = $PSScriptRoot
$icoPath = Join-Path $petDir "public\pet-icon.ico"
$target = Join-Path $petDir "node_modules\electron\dist\electron.exe"
$lnkPath = Join-Path $desktop "PoiPoi.lnk"

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($lnkPath)
$Shortcut.TargetPath = $target
$Shortcut.Arguments = $petDir
$Shortcut.WorkingDirectory = $petDir
$Shortcut.Description = "派派 PoiPoi · AI Desktop Pet 桌宠"
if (Test-Path $icoPath) {
    $Shortcut.IconLocation = "$icoPath,0"
} else {
    $Shortcut.IconLocation = "$target,0"
}
$Shortcut.WindowStyle = 7
$Shortcut.Save()
Write-Host "OK: 桌面快捷方式已创建 -> $lnkPath"
