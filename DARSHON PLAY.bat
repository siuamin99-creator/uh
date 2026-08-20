@echo off
title AminPLAY
mode con: cols=85 lines=32
color 0b

:: Get web port from config.json
for /f "delims=" %%i in ('node -e "try { console.log(JSON.parse(require('fs').readFileSync('config.json')).web_port || 3000); } catch(e) { console.log(3000); }" 2^>nul') do set PORT=%%i
if "%PORT%"=="" set PORT=3000

:init
cls
echo =====================================================================
echo                         AminPLAY SELF-BOT                        
echo =====================================================================
echo.
echo  [1] Start Bot (Auto-Restart enabled)
echo  [2] Update yt-dlp (Fixes YouTube playback issues)
echo  [3] Install/Reinstall Dependencies (npm install)
echo  [4] Install Native Opus (Fixes Audio Stuttering/Lag)
echo  [5] Clean Temporary Files
echo  [6] Test YouTube Browser Cookies (Chrome/Edge/Brave/Firefox)
echo  [7] Test Spotify Credentials Configuration
echo  [8] Open Web Dashboard in Browser
echo  [9] Exit
echo.
echo =====================================================================
set /p opt="Choose an option (default is 1): "
if "%opt%"=="" set opt=1

if "%opt%"=="1" goto start
if "%opt%"=="2" goto update
if "%opt%"=="3" goto install_deps
if "%opt%"=="4" goto install_opus
if "%opt%"=="5" goto clean
if "%opt%"=="6" goto ycookie
if "%opt%"=="7" goto scookie
if "%opt%"=="8" goto open_dash
if "%opt%"=="9" exit
goto init

:start
cls
echo =====================================================================
echo                         AminPLAY SELF-BOT                        
echo =====================================================================
echo.
echo  Cleaning temporary player scripts...
del /f /q *-player-script.js 2>nul
echo.
if not exist node_modules (
    echo  [!] node_modules not found. Installing dependencies first...
    call npm install
    echo.
)
echo  Starting the bot... (Ctrl+C to stop)
echo  -------------------------------------------------------------
echo  Web Dashboard control panel: http://localhost:%PORT%
echo  -------------------------------------------------------------
echo.

:loop
call npm start
echo.
echo =====================================================================
echo  Bot has stopped or crashed.
echo  Restarting in 5 seconds... Press Ctrl+C to cancel.
echo =====================================================================
timeout /t 5
goto loop

:ycookie
cls
echo =====================================================================
echo                     YOUTUBE BROWSER COOKIES CHECK                     
echo =====================================================================
echo.
echo  This tool will test if yt-dlp can extract your YouTube login
echo  session cookies from your browser.
echo.
echo  Instructions:
echo  1. Enter the browser where you are logged into your second YouTube account.
echo     (Choices: chrome, edge, brave, firefox, opera, vivaldi)
echo  2. Close that browser first (if it locks the cookie files).
echo.
echo =====================================================================
echo.
set /p browser="Enter browser name (default is chrome): "
if "%browser%"=="" set browser=chrome
echo.
echo  Testing cookie extraction from "%browser%"...
echo.
yt-dlp.exe --js-runtimes node --cookies-from-browser %browser% --get-id "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
echo.
echo =====================================================================
echo  If the video ID "dQw4w9WgXcQ" is printed above without errors:
echo  1. The extraction succeeded!
echo  2. Open config.json and set "youtube_cookies_from_browser": "%browser%"
echo.
echo  If it failed:
echo  1. Close the browser completely and try again.
echo  2. Ensure you are actually logged into YouTube in that browser.
echo =====================================================================
echo.
echo  Press any key to return to menu...
pause >nul
goto init

:update
cls
echo =====================================================================
echo                         UPDATING YT-DLP                               
echo =====================================================================
echo.
if exist yt-dlp.exe (
    echo  Updating yt-dlp.exe...
    yt-dlp.exe -U
) else (
    echo  [!] yt-dlp.exe not found in the root directory!
)
echo.
echo  Press any key to return to menu...
pause >nul
goto init

:install_deps
cls
echo =====================================================================
echo                     INSTALLING DEPENDENCIES                           
echo =====================================================================
echo.
echo  Running npm install...
call npm install
echo.
echo  Dependencies installed/repaired.
echo  Press any key to return to menu...
pause >nul
goto init

:install_opus
cls
echo =====================================================================
echo                     INSTALLING NATIVE OPUS                           
echo =====================================================================
echo.
echo  This will install @discordjs/opus, which compiles to a native
echo  C++ module and significantly reduces audio stuttering and lag.
echo.
echo  Running npm install @discordjs/opus...
call npm install @discordjs/opus
echo.
echo  Native Opus installation completed.
echo  Press any key to return to menu...
pause >nul
goto init

:clean
cls
echo =====================================================================
echo                       CLEANING TEMP FILES                             
echo =====================================================================
echo.
echo  Deleting temporary player scripts (*-player-script.js)...
del /f /q *-player-script.js 2>nul
echo  Done!
echo.
echo  Press any key to return to menu...
pause >nul
goto init

:scookie
cls
echo =====================================================================
echo                     SPOTIFY CREDENTIALS CHECK                     
echo =====================================================================
echo.
echo  This tool will test if your Spotify Client ID and Client Secret
echo  in config.json are valid and can connect to Spotify.
echo.
echo =====================================================================
echo.
node -e "const fs = require('fs'); const path = require('path'); const configPath = path.join(__dirname, 'config.json'); if (!fs.existsSync(configPath)) { console.log('\x1b[31m[Error] config.json not found!\x1b[0m'); process.exit(1); } const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')); if (!config.spotify_client_id || !config.spotify_client_secret) { console.log('\x1b[31m[Error] Spotify client ID or secret not set in config.json!\x1b[0m'); process.exit(1); } const play = require('play-dl'); console.log('Testing authentication with Spotify...'); play.setToken({ spotify: { client_id: config.spotify_client_id, client_secret: config.spotify_client_secret } }).then(() => { console.log('\x1b[32m[Success] Spotify credentials are VALID and successfully authenticated!\x1b[0m'); process.exit(0); }).catch(err => { console.log('\x1b[31m[Error] Spotify authentication failed: ' + err.message + '\x1b[0m'); process.exit(1); });"
echo.
echo =====================================================================
echo.
echo  Press any key to return to menu...
pause >nul
goto init

:open_dash
cls
echo =====================================================================
echo                     OPENING WEB DASHBOARD                             
echo =====================================================================
echo.
echo  Opening http://localhost:%PORT% in your default browser...
start http://localhost:%PORT%
echo.
echo  Press any key to return to menu...
pause >nul
goto init

