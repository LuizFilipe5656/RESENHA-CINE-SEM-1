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

echo Building Cine Resenha Windows installer...
call pnpm run build:exe
if errorlevel 1 goto build_failed

echo.
echo Build completed successfully.
echo User app: %CD%\build\instaladores\usuarios\Cine-Resenha-Usuarios-Setup.exe
echo Admin panel: %CD%\build\instaladores\painel-admin\Cine-Resenha-Painel-Admin-Setup.exe
pause
exit /b 0

:missing_node
echo Node.js is required. Install Node.js 22 or newer and run this file again.
pause
exit /b 1

:missing_pnpm
echo pnpm is required to build the installers. Install pnpm 11.8.0 and run this file again.
pause
exit /b 1

:missing_supabase_config
echo.
echo Copy .env.example to .env and set your Supabase project URL and publishable/anon key.
pause
exit /b 1

:old_node
echo Node.js 22 or newer is required. Update Node.js and run this file again.
pause
exit /b 1

:build_failed
echo.
echo Build failed. Review the messages above and try again.
echo If pnpm blocks dependency scripts, review them with "pnpm approve-builds" and retry.
pause
exit /b 1
