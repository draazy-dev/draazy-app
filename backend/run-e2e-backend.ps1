# Keep this file ASCII: PowerShell 5.1 reads BOM-less UTF-8 as cp1252.
# -Port must match API_PORT in e2e/playwright.config.js and helpers/liveAuth.js.
param([int]$Port = 8081)
$ErrorActionPreference = 'Stop'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $dir

$env:JAVA_HOME = 'C:\Program Files\Zulu\zulu-25'
# LocalProfileGuard refuses to start without this.
$env:DRAAZY_DEV_MACHINE = '1'

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

$log = Join-Path $env:TEMP "be$Port.log"
if (Test-Path $log) { Remove-Item $log -Force }
# Profile order matters: e2e must come last so its datasource wins.
cmd /c ".\mvnw.cmd -o -DbuildDirName=target-verify spring-boot:run -Dspring-boot.run.profiles=local,e2e ""-Dspring-boot.run.arguments=--server.port=$Port"" > ""$log"" 2>&1"
