param([string]$Python = 'python', [int]$Port = 8766)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskBuildPython = Join-Path $taskRoot '.portable-build-env\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $taskBuildPython)) {
    & $Python -m venv (Join-Path $taskRoot '.portable-build-env')
    if ($LASTEXITCODE -ne 0) { throw 'Failed to create the isolated packaging environment.' }
}
& $taskBuildPython -m pip install --index-url https://pypi.org/simple -r (Join-Path $PSScriptRoot 'requirements-portable.txt')
if ($LASTEXITCODE -ne 0) { throw 'Failed to install packaging dependencies.' }
$env:PYTHONIOENCODING = 'utf-8'
& $taskBuildPython -u (Join-Path $PSScriptRoot 'build_portable.py') --smoke-test --port $Port
if ($LASTEXITCODE -ne 0) { throw 'Portable build or isolated smoke test failed.' }
