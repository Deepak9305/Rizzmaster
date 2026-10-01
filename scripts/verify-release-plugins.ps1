param(
    [string]$ApkPath = (Join-Path $PSScriptRoot '..\android\app\build\outputs\apk\release\app-release-unsigned.apk')
)

$ErrorActionPreference = 'Stop'
$taskSdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } elseif ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$taskBuildTools = Get-ChildItem -LiteralPath (Join-Path $taskSdk 'build-tools') -Directory |
    Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'aapt2.exe') } |
    Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1
if (!$taskBuildTools) { throw 'Android SDK build-tools were not found.' }
$taskApk = (Resolve-Path -LiteralPath $ApkPath).Path
$taskAapt = Join-Path $taskBuildTools.FullName 'aapt2.exe'
$taskResources = & $taskAapt dump resources $taskApk 2>&1
if ($LASTEXITCODE -ne 0) { throw "Could not read release resources: $taskResources" }
# AAPT may shorten the XML file path, while Cordova still looks up xml/config.
$taskResourceText = $taskResources -join "`n"
$taskConfig = [regex]::Match($taskResourceText, 'resource\s+0x[0-9a-f]+\s+xml/config\s*\r?\n\s*\(\)\s+\(file\)\s+(\S+)')
if (!$taskConfig.Success) { throw 'Release is missing the xml/config resource used by Cordova.' }
$taskXml = & $taskAapt dump xmltree $taskApk --file $taskConfig.Groups[1].Value 2>&1
if ($LASTEXITCODE -ne 0) { throw "Release is missing the Cordova plugin registry: $taskXml" }
$taskXmlText = $taskXml -join "`n"
foreach ($taskPlugin in @('InAppBillingPlugin', 'cc.fovea.PurchasePlugin', 'OneSignalPush', 'com.onesignal.cordova.OneSignalPush')) {
    if (!$taskXmlText.Contains($taskPlugin)) { throw "Release registry is missing $taskPlugin" }
}
Write-Output 'Release retains the Cordova registry for billing and OneSignal.'
