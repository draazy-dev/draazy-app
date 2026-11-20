# Keep this file ASCII: PowerShell 5.1 reads BOM-less UTF-8 as cp1252.
$ErrorActionPreference = 'Stop'

$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $dir

$env:JAVA_HOME = 'C:\Program Files\Zulu\zulu-25'
# LocalProfileGuard refuses to start without this.
$env:DRAAZY_DEV_MACHINE = '1'
$env:E2E_DB_URL = 'jdbc:postgresql://localhost:5432/draazy_e2e_adm2'
# Owner links are built from this; it must equal BASE_URL in e2e/run-live-admin.ps1.
$env:E2E_APP_BASE_URL = 'http://localhost:5182'

$envFile = Join-Path $dir '.env.local'
if (Test-Path $envFile) {
    foreach ($raw in Get-Content -LiteralPath $envFile) {
        $line = $raw.Trim()
        if ($line -eq '' -or $line.StartsWith('#')) { continue }
        $eq = $line.IndexOf('=')
        if ($eq -lt 1) { continue }
        $k = $line.Substring(0, $eq).Trim()
        $v = $line.Substring($eq + 1).Trim().Trim('"')
        [Environment]::SetEnvironmentVariable($k, $v, 'Process')
    }
}

$log = Join-Path $env:TEMP 'be8084.log'
if (Test-Path $log) { Remove-Item $log -Force }
Write-Host "admin lane -> :8084, draazy_e2e_adm2, target-admin2; log $log"

# Profile order matters: e2e must come last so its datasource wins.
cmd /c ".\mvnw.cmd -o -DbuildDirName=target-admin2 spring-boot:run -Dspring-boot.run.profiles=local,e2e ""-Dspring-boot.run.arguments=--server.port=8084"" > ""$log"" 2>&1"
