$ErrorActionPreference='Stop'
& (Join-Path $PSScriptRoot 'build_native.cmd')
if ($LASTEXITCODE -ne 0) { throw 'Native build failed' }
