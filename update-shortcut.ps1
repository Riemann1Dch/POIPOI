$desktop = [Environment]::GetFolderPath('Desktop')
$petDir = $PSScriptRoot
$shortcutPath = Join-Path $desktop "PoiPoi.lnk"
$icoPath = Join-Path $petDir "public\pet-icon.ico"
$target = Join-Path $petDir "node_modules\electron\dist\electron.exe"

$WshShell = New-Object -ComObject WScript.Shell
if (Test-Path $shortcutPath) {
  $Shortcut = $WshShell.CreateShortcut($shortcutPath)
  Write-Host "✅ 快捷键已存在，更新图标..."
} else {
  Write-Host "⚠️ 重新创建快捷方式..."
  $Shortcut = $WshShell.CreateShortcut($shortcutPath)
  $Shortcut.TargetPath = $target
  $Shortcut.Arguments = $petDir
  $Shortcut.WorkingDirectory = $petDir
  $Shortcut.Description = "派派 PoiPoi · AI Desktop Pet 桌宠"
}
if (Test-Path $icoPath) {
    $Shortcut.IconLocation = "$icoPath,0"
} else {
    $Shortcut.IconLocation = "$target,0"
}
$Shortcut.WindowStyle = 7
$Shortcut.Save()
Write-Host "✅ 派派 PoiPoi.lnk 已更新"
