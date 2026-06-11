# Generates the PWA launcher icons (a simple "CW" badge in the brand
# terracotta) into client/public/. Re-run if the brand color changes:
#   powershell -ExecutionPolicy Bypass -File client/scripts/make-pwa-icons.ps1
Add-Type -AssemblyName System.Drawing

$outDir = Join-Path $PSScriptRoot '..\public'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function Make-Icon([int]$size, [string]$file) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    $g.TextRenderingHint = 'AntiAlias'

    $bg = [System.Drawing.ColorTranslator]::FromHtml('#c96442')   # --color-accent
    $g.Clear([System.Drawing.Color]::Transparent)

    # Rounded-square background (Android masks it anyway, but keep corners soft).
    $r = [int]($size * 0.18)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc(0, 0, 2 * $r, 2 * $r, 180, 90)
    $path.AddArc($size - 2 * $r, 0, 2 * $r, 2 * $r, 270, 90)
    $path.AddArc($size - 2 * $r, $size - 2 * $r, 2 * $r, 2 * $r, 0, 90)
    $path.AddArc(0, $size - 2 * $r, 2 * $r, 2 * $r, 90, 90)
    $path.CloseFigure()
    $brush = New-Object System.Drawing.SolidBrush($bg)
    $g.FillPath($brush, $path)

    $font = New-Object System.Drawing.Font('Segoe UI', [int]($size * 0.34), [System.Drawing.FontStyle]::Bold, 'Pixel')
    $fmt = New-Object System.Drawing.StringFormat
    $fmt.Alignment = 'Center'
    $fmt.LineAlignment = 'Center'
    $white = [System.Drawing.Brushes]::White
    $rect = New-Object System.Drawing.RectangleF(0, 0, $size, $size)
    $g.DrawString('CW', $font, $white, $rect, $fmt)

    $bmp.Save((Join-Path $outDir $file), [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
    Write-Output "wrote $file ($size x $size)"
}

Make-Icon 192 'icon-192.png'
Make-Icon 512 'icon-512.png'
Make-Icon 180 'apple-touch-icon.png'
