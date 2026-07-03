# Generates build/icon.ico (and icon.png) matching the in-app "W" brand mark:
# a rounded purple square (accent -> accent-hover gradient) with a white W.
# Run: pwsh build/make-icon.ps1
Add-Type -AssemblyName System.Drawing

$outDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$sizes  = 16, 24, 32, 48, 64, 128, 256
$accent = [System.Drawing.Color]::FromArgb(91, 95, 199)   # #5b5fc7
$accentHover = [System.Drawing.Color]::FromArgb(79, 82, 178) # #4f52b2

function New-IconBitmap([int]$s) {
    $bmp = New-Object System.Drawing.Bitmap $s, $s, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.Clear([System.Drawing.Color]::Transparent)

    # Rounded-square background with a diagonal gradient.
    $margin = [Math]::Max(1, [int]($s * 0.06))
    $radius = [Math]::Max(2, [int]($s * 0.22))
    $rect = New-Object System.Drawing.Rectangle $margin, $margin, ($s - 2 * $margin), ($s - 2 * $margin)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $radius * 2
    $path.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
    $path.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)
    $path.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90)
    $path.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, $accent, $accentHover, 45.0
    $g.FillPath($brush, $path)

    # White bold "W" centered.
    $fontSize = [float]($s * 0.5)
    $font = New-Object System.Drawing.Font 'Segoe UI', $fontSize, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
    $fmt = New-Object System.Drawing.StringFormat
    $fmt.Alignment = [System.Drawing.StringAlignment]::Center
    $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
    $layout = New-Object System.Drawing.RectangleF 0, ($s * -0.02), $s, $s
    $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
    $g.DrawString('W', $font, $white, $layout, $fmt)

    $g.Dispose(); $brush.Dispose(); $path.Dispose(); $font.Dispose(); $white.Dispose(); $fmt.Dispose()
    return $bmp
}

# Render each size to an in-memory PNG.
$pngs = @()
foreach ($s in $sizes) {
    $bmp = New-IconBitmap $s
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngs += , @{ size = $s; bytes = $ms.ToArray() }
    if ($s -eq 256) { $bmp.Save((Join-Path $outDir 'icon.png'), [System.Drawing.Imaging.ImageFormat]::Png) }
    $bmp.Dispose(); $ms.Dispose()
}

# Assemble a PNG-compressed ICO (Vista+).
$icoPath = Join-Path $outDir 'icon.ico'
$fs = [System.IO.File]::Create($icoPath)
$bw = New-Object System.IO.BinaryWriter $fs
$bw.Write([UInt16]0)            # reserved
$bw.Write([UInt16]1)            # type = icon
$bw.Write([UInt16]$pngs.Count)  # image count
$offset = 6 + 16 * $pngs.Count
foreach ($p in $pngs) {
    $dim = if ($p.size -ge 256) { 0 } else { $p.size }
    $bw.Write([Byte]$dim)       # width
    $bw.Write([Byte]$dim)       # height
    $bw.Write([Byte]0)          # palette
    $bw.Write([Byte]0)          # reserved
    $bw.Write([UInt16]1)        # color planes
    $bw.Write([UInt16]32)       # bits per pixel
    $bw.Write([UInt32]$p.bytes.Length)
    $bw.Write([UInt32]$offset)
    $offset += $p.bytes.Length
}
foreach ($p in $pngs) { $bw.Write($p.bytes) }
$bw.Flush(); $bw.Dispose(); $fs.Dispose()

Write-Host "Wrote $icoPath ($([Math]::Round((Get-Item $icoPath).Length/1KB)) KB, $($pngs.Count) sizes)"
