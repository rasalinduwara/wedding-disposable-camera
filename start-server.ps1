# Zero-Dependency Localhost Web Server for Wedding Disposable Camera Prototype
# Uses built-in .NET HttpListener so no Node.js or Python installation is required.

param(
  [int]$Port = 8080
)

$Root = $PSScriptRoot
$Url = "http://localhost:$Port/"

$Listener = New-Object System.Net.HttpListener
$Listener.Prefixes.Add($Url)
$Listener.Start()

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " 35mm Wedding Disposable Camera Prototype Server Running!" -ForegroundColor Green
Write-Host " Open in Browser: $Url" -ForegroundColor Yellow
Write-Host " Press Ctrl+C to stop the server." -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Green

try {
  Start-Process $Url
} catch {}

$MimeTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".svg"  = "image/svg+xml"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
}

try {
  while ($Listener.IsListening) {
    $Context = $Listener.GetContext()
    $Request = $Context.Request
    $Response = $Context.Response

    $RelativePath = $Request.Url.LocalPath.TrimStart('/')
    if ([string]::IsNullOrWhiteSpace($RelativePath)) {
      $RelativePath = "index.html"
    }

    $FilePath = Join-Path $Root $RelativePath
    if (Test-Path $FilePath -PathType Leaf) {
      $Ext = [System.IO.Path]::GetExtension($FilePath).ToLower()
      $Response.ContentType = if ($MimeTypes.ContainsKey($Ext)) { $MimeTypes[$Ext] } else { "application/octet-stream" }
      $Bytes = [System.IO.File]::ReadAllBytes($FilePath)
      $Response.ContentLength64 = $Bytes.Length
      $Response.OutputStream.Write($Bytes, 0, $Bytes.Length)
    } else {
      $Response.StatusCode = 404
    }
    $Response.Close()
  }
} finally {
  $Listener.Stop()
}
