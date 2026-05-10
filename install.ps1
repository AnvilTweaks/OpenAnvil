$ErrorActionPreference = "Stop"

$InstallDir = if ($env:FEATHER_PATCHER_INSTALL_DIR) { $env:FEATHER_PATCHER_INSTALL_DIR } else { Join-Path $HOME ".local\share\feather-launcher-patcher" }
$BinDir = if ($env:FEATHER_PATCHER_BIN_DIR) { $env:FEATHER_PATCHER_BIN_DIR } else { Join-Path $HOME ".local\bin" }
$SourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js was not found in PATH. Install Node.js 18 or newer from https://nodejs.org/, open a new PowerShell window, then run this installer again."
}

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
New-Item -ItemType Directory -Force -Path $BinDir | Out-Null

Copy-Item -Force (Join-Path $SourceDir "patch-feather.js") (Join-Path $InstallDir "patch-feather.js")
Copy-Item -Force (Join-Path $SourceDir "package.json") (Join-Path $InstallDir "package.json")
Copy-Item -Force (Join-Path $SourceDir "README.md") (Join-Path $InstallDir "README.md")

$CmdPath = Join-Path $BinDir "feather-patcher.cmd"
$ScriptPath = Join-Path $InstallDir "patch-feather.js"
Set-Content -Path $CmdPath -Encoding ASCII -Value "@echo off`r`nnode `"$ScriptPath`" %*`r`n"

Write-Host "  Feather Utility"
Write-Host "  installer"
Write-Host "  ----------------------------"
Write-Host ""
Write-Host "installed $CmdPath"
Write-Host ""
Write-Host "Run:"
Write-Host "  feather-patcher"
Write-Host "  feather-patcher patch"
Write-Host "  feather-patcher restore"
Write-Host "  feather-patcher agent"
Write-Host "  feather-patcher config"

$PathParts = [Environment]::GetEnvironmentVariable("Path", "User") -split ";"
if ($PathParts -notcontains $BinDir) {
  $answer = Read-Host "Add $BinDir to your user PATH now? [y/N]"
  if ($answer -match "^(y|yes)$") {
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ([string]::IsNullOrWhiteSpace($userPath)) {
      [Environment]::SetEnvironmentVariable("Path", $BinDir, "User")
    } else {
      [Environment]::SetEnvironmentVariable("Path", "$userPath;$BinDir", "User")
    }
    Write-Host "Added $BinDir to your user PATH. Open a new terminal before running feather-patcher by name."
  } else {
    Write-Host "Run directly with:"
    Write-Host "  $CmdPath --help"
  }
}
