# Start all Pixelle components in separate windows
Write-Host "Starting Pixelle Backend API..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-File", "$PSScriptRoot\run_backend.ps1"

Start-Sleep -Seconds 3

Write-Host "Starting Pixelle Web Studio..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-File", "$PSScriptRoot\run_frontend.ps1"

Start-Sleep -Seconds 3

Write-Host "Starting Pixelle Desktop Companion..." -ForegroundColor Magenta
Start-Process powershell -ArgumentList "-NoExit", "-File", "$PSScriptRoot\run_desktop.ps1"

Write-Host "`nAll Pixelle services launched!" -ForegroundColor Yellow
Write-Host "Web Studio: http://localhost:5173"
Write-Host "Backend API: http://localhost:8000/docs"
