@echo off
REM Requires Python 3.11 (torch 2.1.0 and mmcv 2.1.0 have no wheels for other versions)
cd /d "%~dp0"
python -m pip install -r requirements.txt || exit /b 1
REM mmpose is installed separately because its dependency chumpy only ships as a source package that fails to build with pip's default isolated build, which breaks a plain pip install -r requirements.txt. The backend does not use chumpy.
python -m pip install --no-deps mmpose==1.3.2
