# Baut release\win-unpacked (electron-builder) und release\PixelLeiste-Setup-<Version>.exe (Inno Setup 6).
# Die Version kommt ausschliesslich aus package.json ("version": "x.y.z").
# Aufruf aus dem Projektordner:  powershell -ExecutionPolicy Bypass -File installer\build.ps1 [-SkipTests]

param([switch]$SkipTests)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$version = (Get-Content "package.json" -Raw | ConvertFrom-Json).version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw "Version in package.json ungueltig: $version" }
Write-Host "Baue PixelLeiste $version"

if (-not (Test-Path "node_modules")) { npm ci; if ($LASTEXITCODE -ne 0) { throw "npm ci fehlgeschlagen" } }

if (-not $SkipTests) {
    npm test
    if ($LASTEXITCODE -ne 0) { throw "Tests fehlgeschlagen" }
}

npm run build
if ($LASTEXITCODE -ne 0) { throw "Web-Build fehlgeschlagen" }

if (Test-Path "release\win-unpacked") { Remove-Item -Recurse -Force "release\win-unpacked" }
npx electron-builder --win dir --publish never
if ($LASTEXITCODE -ne 0) { throw "electron-builder fehlgeschlagen" }

$iscc = @(
    "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe",
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) { throw "Inno Setup 6 nicht gefunden (winget install JRSoftware.InnoSetup)" }

& $iscc /Q "/DAppVersion=$version" installer\PixelLeiste.iss
if ($LASTEXITCODE -ne 0) { throw "Inno Setup fehlgeschlagen" }

$setup = Get-Item "release\PixelLeiste-Setup-$version.exe"
$hash = (Get-FileHash $setup.FullName -Algorithm SHA256).Hash.ToLower()
"$hash  $($setup.Name)" | Set-Content "$($setup.FullName).sha256" -Encoding ascii -NoNewline
Write-Host ("{0,-36} {1,6:N1} MB" -f $setup.Name, ($setup.Length / 1MB))
