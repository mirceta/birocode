# Ops panel -- PowerShell HttpListener server, dual-stack prefixes, fixed port.
$ErrorActionPreference = 'Stop'
$port = 5413
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$port/")
$listener.Prefixes.Add("http://[::1]:$port/")
$listener.Start()
Write-Host "ops panel on http://127.0.0.1:$port/ and http://[::1]:$port/"

while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $reqPath = $ctx.Request.Url.AbsolutePath
    if ($reqPath -eq '/') { $reqPath = '/index.html' }
    $file = Join-Path $root ($reqPath.TrimStart('/'))
    if (Test-Path $file) {
        $bytes = [System.IO.File]::ReadAllBytes($file)
        $ctx.Response.ContentType = 'text/html; charset=utf-8'
        $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
        $ctx.Response.StatusCode = 404
    }
    $ctx.Response.Close()
}
