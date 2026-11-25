# Launch Pixelle Backend API
Set-Location "$PSScriptRoot\backend"
& ".\venv\Scripts\Activate.ps1"
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
