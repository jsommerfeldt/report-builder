[CmdletBinding()]
param(
    [ValidateSet('Start', 'Open', 'Stop', 'Build', 'Export', 'Status')]
    [string] $Action = 'Start',
    [switch] $NoBrowser
)
$ErrorActionPreference = 'Stop'
$pilotHome = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'RDWDW/ReportBuilderPilot'
$python = Join-Path $pilotHome 'venv/Scripts/python.exe'
$server = Join-Path $PSScriptRoot 'app.py'
$origin = 'http://127.0.0.1:8784'

function Test-Pilot {
    try {
        $health = Invoke-RestMethod -Uri "$origin/health" -TimeoutSec 2
        return $health.service -eq 'rdwdw-csv-report-builder'
    } catch { return $false }
}

if ($Action -eq 'Build') {
    $buildDir = Join-Path $pilotHome 'ui'
    $source = Join-Path $PSScriptRoot 'ui'
    $buildSource = Join-Path $buildDir 'src'
    New-Item -ItemType Directory -Force -Path $buildSource | Out-Null
    if (-not (Test-Path -LiteralPath $python)) {
        py -3.13 -m venv (Join-Path $pilotHome 'venv')
        if ($LASTEXITCODE) { throw 'Could not create the pilot Python environment.' }
    }
    & $python -m pip --isolated --disable-pip-version-check --no-input install --only-binary=:all: --index-url https://pypi.org/simple -r (Join-Path $PSScriptRoot 'requirements.txt')
    if ($LASTEXITCODE) { throw 'Python dependency installation failed.' }
    foreach ($name in 'package.json','pnpm-lock.yaml','tsconfig.json') {
        Copy-Item -LiteralPath (Join-Path $source $name) -Destination $buildDir -Force
    }
    Get-ChildItem -File -LiteralPath (Join-Path $source 'src') | Copy-Item -Destination $buildSource -Force
    pnpm --dir "$buildDir" install --ignore-scripts --frozen-lockfile --registry=https://registry.npmjs.org/ --store-dir (Join-Path $pilotHome 'pnpm-store')
    if ($LASTEXITCODE) { throw 'Frontend dependency installation failed.' }
    pnpm --dir "$buildDir" run build
    if ($LASTEXITCODE) { throw 'Frontend build failed.' }
    return
}
if ($Action -eq 'Status') {
    if (Test-Pilot) { Write-Output "Running at $origin" } else { Write-Output 'Stopped' }
    return
}
if (-not (Test-Path -LiteralPath $python)) { throw 'Run pilot.ps1 -Action Build first.' }
if ($Action -eq 'Export') {
    & $python -B (Join-Path $PSScriptRoot 'export_csv.py')
    if ($LASTEXITCODE) { throw 'The private CSV export failed.' }
    return
}
if ($Action -eq 'Stop') {
    if (-not (Test-Pilot)) { return }
    $listener = Get-NetTCPConnection -State Listen -LocalAddress '127.0.0.1' -LocalPort 8784
    $owner = Get-CimInstance Win32_Process -Filter ("ProcessId=" + $listener.OwningProcess)
    if ($owner.Name -ne 'python.exe' -or -not $owner.CommandLine.Contains($server) -or $owner.CommandLine -notmatch '\bserve\s*$') {
        throw 'The listener could not be identified as this pilot.'
    }
    Stop-Process -Id $owner.ProcessId -ErrorAction Stop
    return
}
if ($Action -eq 'Start' -and -not (Test-Pilot)) {
    $arguments = '-B "' + $server + '" serve'
    $started = Start-Process -FilePath $python -ArgumentList $arguments -WorkingDirectory $pilotHome -WindowStyle Hidden -PassThru
    for ($attempt=0; $attempt -lt 35; $attempt++) {
        if (Test-Pilot) { break }
        if ($started.HasExited) { throw 'The pilot did not start. Check Build and Export.' }
        Start-Sleep -Milliseconds 200
    }
}
if (-not (Test-Pilot)) { throw 'The pilot is stopped. Run pilot.ps1 -Action Start.' }
if (-not $NoBrowser) {
    & $python -B $server open
    if ($LASTEXITCODE) { throw 'The private browser tab could not be opened.' }
}
Write-Output "Report Builder is running at $origin"
