<#
.SYNOPSIS
  Render a generated SOW (or any local HTML) to PDF via Edge headless — no
  print dialog, no browser headers/footers, backgrounds preserved.

.DESCRIPTION
  Edge headless writes harmless "ERROR:...fallback_task_provider.cc" chatter to
  stderr, which PowerShell paints red even on success. Start-Process with
  -RedirectStandardError sends that to a log file so the console stays clean and
  the exit state is judged on whether the PDF actually appeared.

  Notes on the flags:
    --no-pdf-header-footer   suppresses the date / title / file-URL that Edge's
                             print dialog adds by default
    background graphics      on by default in headless (no equivalent of the
                             dialog checkbox needed) — this is what keeps the
                             hero cover, navy table headers and snapshot tiles

.EXAMPLE
  .\scripts\print-sow-pdf.ps1
  Renders dist/sow/Expert_Institute_SOW.html next to itself as .pdf

.EXAMPLE
  .\scripts\print-sow-pdf.ps1 -Html dist\sow\Some_Other_SOW.html -Open
#>
[CmdletBinding()]
param(
  # HTML to render. Relative paths resolve against the repo root.
  [string] $Html = "dist\sow\Expert_Institute_SOW.html",
  # Output PDF. Defaults to the input path with a .pdf extension.
  [string] $Pdf,
  # Open the PDF when it's done.
  [switch] $Open
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not [System.IO.Path]::IsPathRooted($Html)) { $Html = Join-Path $repoRoot $Html }
if (-not (Test-Path $Html)) {
  Write-Error "Input HTML not found: $Html`nGenerate it first, e.g. node scripts/build-expert-institute-sow.mjs"
}
$Html = (Resolve-Path $Html).Path

if (-not $Pdf) { $Pdf = [System.IO.Path]::ChangeExtension($Html, ".pdf") }
elseif (-not [System.IO.Path]::IsPathRooted($Pdf)) { $Pdf = Join-Path $repoRoot $Pdf }

$edge = @(
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $edge) { Write-Error "Neither Edge nor Chrome found in Program Files." }

# Edge leaves a stale PDF in place if it can't write the new one — remove it
# first so a failure is visible instead of looking like "nothing changed".
if (Test-Path $Pdf) { Remove-Item $Pdf -Force }
New-Item -ItemType Directory -Force (Split-Path -Parent $Pdf) | Out-Null

$log = Join-Path $env:TEMP "edge-print-sow.log"
$fileUrl = "file:///" + ($Html -replace '\\', '/')

Start-Process -FilePath $edge -Wait -NoNewWindow -RedirectStandardError $log -ArgumentList @(
  "--headless",
  "--disable-gpu",
  "--no-pdf-header-footer",
  "--print-to-pdf=$Pdf",
  $fileUrl
)

if (-not (Test-Path $Pdf)) {
  Write-Error "Render failed - no PDF produced. Edge output: $log"
}

"OK  $Pdf  ({0:N0} KB)" -f ((Get-Item $Pdf).Length / 1KB)
if ($Open) { Start-Process $Pdf }
