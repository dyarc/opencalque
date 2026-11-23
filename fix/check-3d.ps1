# Checks the 3D work: installs what the workspace is missing (three included), then types, tests and builds.
# Run it from anywhere:  powershell -ExecutionPolicy Bypass -File fix\check-3d.ps1
# Every step runs even when the one before it fails, so that one run tells all there is to know.
$root = 'C:\Users\lideyi\Documents\deepseek-harness\default-workspace\opencalque-main'
$node = 'C:\Users\lideyi\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'
$pnpm = 'C:\Users\lideyi\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs'

# pnpm -r calls pnpm again, so the folder node lives in has to be on the path, not just $node itself.
$env:PATH = "$(Split-Path $node);$env:PATH"
$env:TEMP = Join-Path $root '.tmp'
$env:TMP = $env:TEMP
New-Item -ItemType Directory -Force -Path $env:TEMP | Out-Null
Set-Location $root

Write-Host "==> pnpm install  (a few minutes the first time: node_modules is empty)" -ForegroundColor Cyan
& $node $pnpm install
Write-Host "EXIT install = $LASTEXITCODE"

Write-Host "==> pnpm typecheck" -ForegroundColor Cyan
& $node $pnpm typecheck
Write-Host "EXIT typecheck = $LASTEXITCODE"

Write-Host "==> pnpm test" -ForegroundColor Cyan
& $node $pnpm test
Write-Host "EXIT test = $LASTEXITCODE"

Write-Host '==> pnpm --filter @opencalque/web build' -ForegroundColor Cyan
& $node $pnpm --filter '@opencalque/web' build
Write-Host "EXIT build = $LASTEXITCODE"
