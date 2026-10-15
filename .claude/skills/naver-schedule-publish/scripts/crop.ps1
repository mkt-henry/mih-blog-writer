# usage: crop.ps1 <src.png> <dst.png> <x> <y> <innerWidth>
# Crops the "예약 발행 글" list (542x440 CSS px) out of a full-viewport capture.
# The capture is in device pixels, so everything is scaled by imageWidth / innerWidth (125% screens → 1.25).
param($src, $dst, [double]$x, [double]$y, [double]$iw)
Add-Type -AssemblyName System.Drawing
$i = [Drawing.Image]::FromFile($src); $s = $i.Width / $iw
$w = [int](542 * $s); $h = [int](440 * $s)
$b = New-Object Drawing.Bitmap $w, $h; $g = [Drawing.Graphics]::FromImage($b)
$g.DrawImage($i, (New-Object Drawing.Rectangle 0, 0, $w, $h), (New-Object Drawing.Rectangle ([int]($x * $s)), ([int]($y * $s)), $w, $h), [Drawing.GraphicsUnit]::Pixel)
$b.Save($dst); $i.Dispose(); "scale $s -> $dst"
