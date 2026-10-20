@echo off
setlocal
cd /d "%~dp0"

rem Prefer the portable runtime used to validate this revision.
set "ARTICLE_TECTONIC=%~dp0..\runtimes\tectonic-0.17.0\tectonic.exe"
if exist "%ARTICLE_TECTONIC%" goto tectonic
where tectonic >nul 2>nul
if not errorlevel 1 (
  set "ARTICLE_TECTONIC=tectonic"
  goto tectonic
)
where pdflatex >nul 2>nul
if errorlevel 1 goto missing
where bibtex >nul 2>nul
if errorlevel 1 goto missing

pdflatex -interaction=nonstopmode -halt-on-error main.tex
if errorlevel 1 goto fail
bibtex main
if errorlevel 1 goto fail
pdflatex -interaction=nonstopmode -halt-on-error main.tex
if errorlevel 1 goto fail
pdflatex -interaction=nonstopmode -halt-on-error main.tex
if errorlevel 1 goto fail
goto publish

:tectonic
"%ARTICLE_TECTONIC%" --keep-logs --keep-intermediates main.tex
if errorlevel 1 goto fail

:publish
if not exist "..\output\pdf" mkdir "..\output\pdf"
if errorlevel 1 goto fail
copy /y main.pdf "..\output\pdf\E2P_artigo_atualizado.pdf" >nul
if errorlevel 1 goto fail
copy /y main.pdf main_revisado.pdf >nul
if errorlevel 1 goto fail
echo Artigo compilado: %~dp0..\output\pdf\E2P_artigo_atualizado.pdf
exit /b 0

:missing
echo Instale Tectonic ou uma distribuicao LaTeX com pdflatex e BibTeX.
echo No Overleaf, use main.tex como documento principal.
exit /b 1

:fail
echo Falha na compilacao. Consulte main.log.
exit /b 1
