# Fetches OpenCalque from GitHub next to the project and reports what it has that AxioDraw does not.
# Nothing in the project is changed: the copy lands in ..\upstream\src and the report in ..\upstream.
#   powershell -ExecutionPolicy Bypass -File fix\upstream-diff.ps1
# If the download is blocked, unzip a copy of OpenCalque into ..\upstream\src by hand and run it again.
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$repo = 'C:\Users\lideyi\Documents\deepseek-harness\default-workspace\opencalque-main'
$out = 'C:\Users\lideyi\Documents\deepseek-harness\default-workspace\upstream'
$src = Join-Path $out 'src'
New-Item -ItemType Directory -Force -Path $out | Out-Null

if (-not (Test-Path (Join-Path $src 'package.json'))) {
  $zip = Join-Path $out 'opencalque.zip'
  Write-Host 'Downloading OpenCalque from GitHub...' -ForegroundColor Cyan
  Invoke-WebRequest -Uri 'https://codeload.github.com/dyarc/opencalque/zip/refs/heads/main' -OutFile $zip -UseBasicParsing
  $temp = Join-Path $out 'unpacked'
  if (Test-Path $temp) { Remove-Item $temp -Recurse -Force }
  Write-Host 'Unpacking...' -ForegroundColor Cyan
  Expand-Archive -Path $zip -DestinationPath $temp -Force
  $inner = Get-ChildItem $temp -Directory | Select-Object -First 1
  if (Test-Path $src) { Remove-Item $src -Recurse -Force }
  Move-Item $inner.FullName $src
}

$theirsVersion = (Get-Content (Join-Path $src 'package.json') -Raw | ConvertFrom-Json).version
$mineVersion = (Get-Content (Join-Path $repo 'package.json') -Raw | ConvertFrom-Json).version
Write-Host "OpenCalque $theirsVersion   vs   AxioDraw $mineVersion" -ForegroundColor Green

$skip = 'node_modules|\\dist\\|\\.git\\|\\.tmp\\|\\.pnpm'
function Map($root) {
  $map = @{}
  Get-ChildItem $root -Recurse -File -Force | Where-Object { $_.FullName -notmatch $skip } | ForEach-Object {
    $map[$_.FullName.Substring($root.Length + 1)] = (Get-FileHash $_.FullName -Algorithm SHA256).Hash
  }
  return $map
}

$theirs = Map $src
$mine = Map $repo
$onlyTheirs = @($theirs.Keys | Where-Object { -not $mine.ContainsKey($_) } | Sort-Object)
$onlyMine = @($mine.Keys | Where-Object { -not $theirs.ContainsKey($_) } | Sort-Object)
$differ = @($theirs.Keys | Where-Object { $mine.ContainsKey($_) -and $mine[$_] -ne $theirs[$_] } | Sort-Object)

$report = Join-Path $out 'REPORT.txt'
@(
  "OpenCalque $theirsVersion  vs  AxioDraw $mineVersion",
  '',
  "== only in OpenCalque (what we may be missing): $($onlyTheirs.Count) ==",
  $onlyTheirs,
  '',
  "== in both, different: $($differ.Count) ==",
  $differ,
  '',
  "== only in AxioDraw (our own work): $($onlyMine.Count) ==",
  $onlyMine
) | Set-Content $report -Encoding UTF8

$head = Join-Path $out 'CHANGELOG-head.txt'
Get-Content (Join-Path $src 'CHANGELOG.md') | Select-Object -First 200 | Set-Content $head -Encoding UTF8

Write-Host ''
Write-Host "Report:            $report" -ForegroundColor Green
Write-Host "Their changelog:   $head" -ForegroundColor Green
Write-Host ''
Write-Host "First 60 files only in OpenCalque:" -ForegroundColor Cyan
$onlyTheirs | Select-Object -First 60
