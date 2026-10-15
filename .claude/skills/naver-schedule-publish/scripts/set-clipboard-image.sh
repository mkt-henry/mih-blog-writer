#!/bin/bash
# usage: set-clipboard-image.sh <image-url> <tmpdir>  — puts the image on the Windows clipboard as bitmap
curl -s -o "$2/rep.jpg" "$1" || exit 1
W=$(cygpath -w "$2/rep.jpg")
powershell -NoProfile -STA -Command "Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; \$i=[System.Drawing.Image]::FromFile('$W'); [System.Windows.Forms.Clipboard]::SetImage(\$i); \$i.Dispose(); 'clip ' + [System.Windows.Forms.Clipboard]::ContainsImage()"
