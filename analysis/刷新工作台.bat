@echo off
chcp 65001 >nul
cd /d "%~dp0"

rem ============ 定位 Python ============
set "PYCMD="
where python >nul 2>nul && set "PYCMD=python"
if not defined PYCMD where py >nul 2>nul && set "PYCMD=py -3"
if not defined PYCMD (
    echo [错误] 找不到 Python，请先安装 Python 3 或将其加入 PATH 环境变量。
    echo.
    pause
    exit /b 1
)

echo ========================================
echo  正在刷新 MCCB 认知测评工作台 ...
echo ========================================
%PYCMD% refresh.py
if errorlevel 1 (
    echo.
    echo [错误] 刷新失败，请检查上方输出（常见原因：xls 被占用 / 表头异常）。
    echo.
    pause
    exit /b 1
)
echo ========================================
echo  完成，正在打开工作台 ...
echo ========================================
start "" "%~dp0mccb_dashboard.html"
timeout /t 3 >nul
