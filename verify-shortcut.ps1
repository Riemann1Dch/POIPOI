$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut("$env:USERPROFILE\Desktop\PoiPoi.lnk")
Write-Host "═════ 派派快捷方式状态 ═════"
Write-Host "目标:       $($sc.TargetPath)"
Write-Host "参数:       $($sc.Arguments)"
Write-Host "工作目录:   $($sc.WorkingDirectory)"
Write-Host "图标:       $($sc.IconLocation)"
Write-Host ""
if (Test-Path "$env:USERPROFILE\Desktop\PoiPoi.lnk") { Write-Host "✅ 快捷方式文件存在" }
$petDir = $PSScriptRoot
if (Test-Path (Join-Path $petDir "public\pet-icon.ico")) { Write-Host "✅ 图标文件存在 (pet-icon.ico)" }
Remove-Item (Join-Path $petDir "verify-shortcut.ps1")
