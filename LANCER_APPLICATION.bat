@echo off
title CTT
cd /d "%~dp0"
set "CTT_FIRST_SETUP=0"

echo ======================================================
echo    DEMARRAGE CISSE TRANSIT ET TRANSPORT
echo ======================================================
echo.

:: Si CTT tourne deja, reouvrir le logiciel sans lancer un second serveur.
powershell -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:5000' -TimeoutSec 2; if ($r.StatusCode -eq 200 -and $r.Content -match 'CISSE TRANSIT') { exit 0 }; exit 1 } catch { exit 1 }"
if not errorlevel 1 (
  echo Le logiciel est deja demarre. Ouverture dans le navigateur...
  start "" http://localhost:5000
  exit /b 0
)

:: Sur ce PC, reutiliser l'installation CTT configuree et sa base de donnees.
set "CTT_INSTALLED=%USERPROFILE%\OneDrive\Bureau\CTT-facturation-livraison"
for %%I in ("%~dp0.") do set "CTT_CURRENT=%%~fI"
for %%I in ("%CTT_INSTALLED%") do set "CTT_MAIN=%%~fI"
if /I not "%CTT_CURRENT%"=="%CTT_MAIN%" if exist "%CTT_INSTALLED%\node_modules\@prisma\client" (
  echo Mise a jour de l'interface d'impression dans l'installation CTT existante.
  if not exist "%CTT_INSTALLED%\dist\assets" mkdir "%CTT_INSTALLED%\dist\assets"
  xcopy "%~dp0dist\*" "%CTT_INSTALLED%\dist\" /E /I /Y >nul
  if errorlevel 1 (
    echo ERREUR : les fichiers d'impression n'ont pas pu etre installes.
    echo Fermez les fenetres du logiciel puis relancez ce fichier.
    pause
    exit /b 1
  )
  echo Les boutons d'impression et l'archivage general sont installes. Vos donnees et votre configuration sont conservees.
  call "%CTT_INSTALLED%\LANCER_APPLICATION.bat"
  if errorlevel 1 exit /b 1
  exit /b 0
)

if not exist .env set "CTT_FIRST_SETUP=1"
findstr /C:"REMPLACER_PAR_UNE_CLE_ALEATOIRE" /C:"REMPLACER_PAR_UN_CODE_DIRECTEUR" .env >nul 2>nul
if not errorlevel 1 set "CTT_FIRST_SETUP=1"
if exist initialiser-configuration.mjs (
  node initialiser-configuration.mjs
  if errorlevel 1 (
    echo ERREUR : configuration impossible. Si une base existe deja, restaurez le fichier .env d'origine.
    exit /b 1
  )
)

if not exist node_modules\@prisma\client (
  echo Installation des composants necessaires au premier lancement...
  call npm ci
  if errorlevel 1 (
    echo ERREUR : installation impossible. Verifiez Node.js et la connexion Internet.
    exit /b 1
  )
)

if not exist dist\index.html (
  echo Preparation de l'interface...
  call npm run build
  if errorlevel 1 (
    echo ERREUR : compilation impossible.
    exit /b 1
  )
)

if not exist prisma\dev.db (
  echo Initialisation de la base de donnees locale...
  call npm run db:sync
  if errorlevel 1 (
    echo ERREUR : preparation de la base impossible. Verifiez DATABASE_URL.
    exit /b 1
  )
)

node demarrer-serveur.mjs
if errorlevel 1 (
  echo ERREUR : impossible de lancer le serveur.
  if exist ctt-server-error.log type ctt-server-error.log
  exit /b 1
)
powershell -NoProfile -Command "Start-Sleep -Seconds 3"
powershell -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:5000' -TimeoutSec 8; if ($r.StatusCode -eq 200 -and $r.Content -match 'CISSE TRANSIT') { exit 0 }; exit 1 } catch { exit 1 }"
if errorlevel 1 (
  echo Le serveur ne repond pas. Detail de l'erreur :
  if exist ctt-server-error.log type ctt-server-error.log
  exit /b 1
)
start "" http://localhost:5000
if "%CTT_FIRST_SETUP%"=="1" (
  echo.
  echo CODE DIRECTEUR INITIAL :
  type CODE_DIRECTEUR_INITIAL.txt
  echo.
  echo Conservez le code puis supprimez le fichier CODE_DIRECTEUR_INITIAL.txt.
  pause
)
exit /b 0
