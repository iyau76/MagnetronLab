@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools\VC\Auxiliary\Build\vcvars64.bat" >nul
cd /d "%~dp0"
cl /nologo /std:c++17 /O2 /fp:precise /EHsc /MT /LD magnetron_core.cpp /Fe:..\magnetron_core.dll /link /INCREMENTAL:NO
if errorlevel 1 exit /b 1
dumpbin /DEPENDENTS ..\magnetron_core.dll
