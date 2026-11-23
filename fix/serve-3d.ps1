# Serves the built app so the 3D view can be looked at:  Shift+3 in the editor opens it.
# Run it and leave the window open; stop it with Ctrl+C.
#   powershell -ExecutionPolicy Bypass -File fix\serve-3d.ps1
# It sets node and pnpm on the path itself, because a fresh PowerShell window has neither.
$root = 'C:\Users\lideyi\Documents\deepseek-harness\default-workspace\opencalque-main'
$nodeDir = 'C:\Users\lideyi\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin'
$pnpm = 'C:\Users\lideyi\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs'
$shims = 'C:\Users\lideyi\Documents\deepseek-harness\default-workspace\.shims'

$env:PATH = "$nodeDir;$env:PATH"
if (Test-Path $shims) { $env:PATH = "$shims;$env:PATH" }
$env:TEMP = Join-Path $root '.tmp'
$env:TMP = $env:TEMP
New-Item -ItemType Directory -Force -Path $env:TEMP | Out-Null
Set-Location $root

$node = Join-Path $nodeDir 'node.exe'
# Built every time, so that what is served is the code as it stands now and never a stale dist.
Write-Host 'Building apps/web...' -ForegroundColor Cyan
& $node $pnpm --filter '@opencalque/web' build
if ($LASTEXITCODE -ne 0) { Write-Host "build failed with $LASTEXITCODE" -ForegroundColor Red; return }

# The port the last run left open is the port this run wants: it is taken, so the next free one is found.
$port = 4174
while ($port -le 4190 -and (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)) { $port++ }
if ($port -gt 4190) { Write-Host 'Every port from 4174 to 4190 is in use.' -ForegroundColor Red; return }

Write-Host "Serving on http://127.0.0.1:$port  (open it, then press Shift+3 in the editor)" -ForegroundColor Cyan
& $node $pnpm --filter '@opencalque/web' preview --port $port --strictPort --host 127.0.0.1
Write-Host "vite preview exited with $LASTEXITCODE" -ForegroundColor Yellow
