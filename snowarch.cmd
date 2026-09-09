@echo off
where node >nul 2>nul || (echo snowarch: Node.js 20+ is required for this command. Design-only works without it: .\bootstrap.cmd --mode design ^& exit /b 3)
node "%~dp0tools\snowarch\bin\snowarch.mjs" %*
exit /b %ERRORLEVEL%
