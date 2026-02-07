@echo off
call "C:Program Files (x86)Microsoft Visual Studio8BuildToolsVCAuxiliaryBuildcvars64.bat"
set PATH=C:Usersharis.cargoin;%PATH%
npm run tauri dev
