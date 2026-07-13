@echo off

cd /d D:\Projetos\qa-job-prospector

if not exist logs mkdir logs

echo. >> logs\daily.log
echo ========================================== >> logs\daily.log
echo EXECUCAO: %date% %time% >> logs\daily.log
echo ========================================== >> logs\daily.log

call npm run daily >> logs\daily.log 2>&1

exit /b %errorlevel%