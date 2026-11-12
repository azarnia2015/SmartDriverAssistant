@echo off
chcp 65001 >nul 2>&1
setlocal
title Push SmartDriverAssistant to GitHub

echo.
echo  ============================================
echo    Smart Driver Assistant 2.0 - GitHub Push
echo  ============================================
echo.

where git >nul 2>&1
if errorlevel 1 (
  echo  [X] Git is not installed.
  echo      Download: https://git-scm.com/download/win
  echo      Install it, close this window, open a NEW Command Prompt and run this again.
  echo.
  pause
  exit /b 1
)

if "%~1"=="" goto usage
echo %~1 | findstr /i "USERNAME your-user" >nul && goto placeholder

echo  [1/5] git init
git init -q
echo  [2/5] staging files
git add -A
echo  [3/5] commit
git -c user.name="Smart Driver Assistant" -c user.email="dev@example.com" commit -qm "ranande hooshmand 2.0 - initial commit"
if errorlevel 1 echo        (nothing new to commit - continuing)
echo  [4/5] branch main + remote
git branch -M main
git remote remove origin >nul 2>&1
git remote add origin %~1
echo  [5/5] push  (a browser window may open for GitHub sign-in)
echo.
git push -u origin main
if errorlevel 1 (
  echo.
  echo  [!] Push failed. Most common causes:
  echo      - The repository does not exist yet. Create it: https://github.com/new  ^(name: SmartDriverAssistant, EMPTY, no README^)
  echo      - Wrong URL. It must look like: https://github.com/YOUR-USERNAME/SmartDriverAssistant.git
  echo      - Not signed in. Run:  git config --global credential.helper manager
  echo.
  pause
  exit /b 1
)
echo.
echo  [OK] Uploaded: %~1
echo       Open it in the browser and press "Releases" to attach the APK.
echo.
pause
exit /b 0

:placeholder
echo  [!] Replace USERNAME in the URL with your real GitHub username.
echo      Example: push.bat https://github.com/ali-reza/SmartDriverAssistant.git
echo.
pause
exit /b 1

:usage
echo  Usage:  push.bat https://github.com/YOUR-USERNAME/SmartDriverAssistant.git
echo.
echo  Before that:
echo    1^) Create an EMPTY repo at https://github.com/new   ^(name: SmartDriverAssistant^)
echo    2^) Copy its URL ^(green Code button^)
echo.
pause
exit /b 1
