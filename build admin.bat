```bat
@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto missing_node

for /f "tokens=1 delims=." %%V in ('node -p "process.versions.node"') do set NODE_MAJOR=%%V
if not defined NODE_MAJOR goto missing_node
if %NODE_MAJOR% LSS 22 goto old_node

node scripts\require-supabase-config.cjs
if errorlevel 1 goto missing_supabase_config

where pnpm >nul 2>nul
if errorlevel 1 goto missing_pnpm

echo Checking project dependencies...
call pnpm install --frozen-lockfile
if errorlevel 1 goto build_failed

echo Building Cine Resenha Admin Panel...
call pnpm run build:admin:exe
if errorlevel 1 goto build_failed

echo.
echo Build completed successfully.
echo Admin installer:
echo %CD%\build\instaladores\painel-admin\Cine-Resenha-Painel-Admin-Setup.exe
pause
exit /b 0

:missing_node
echo Node.js 22 or newer is required.
pause
exit /b 1

:missing_pnpm
echo Install pnpm 11.8.0.
pause
exit /b 1

:missing_supabase_config
echo Configure your Supabase URL and publishable/anon key in .env.
pause
exit /b 1

:old_node
echo Update Node.js to version 22 or newer.
pause
exit /b 1

:build_failed
echo.
echo Build failed. Check the error messages above.
pause
exit /b 1
```