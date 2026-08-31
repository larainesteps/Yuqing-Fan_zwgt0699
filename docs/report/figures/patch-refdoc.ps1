# Patch the pandoc reference copy of the School template so its `Normal` style is 11 pt.
#
# Why this is needed: the template's own layout note requires 11 pt, and its example body
# paragraphs are 11 pt — but applied as direct formatting over a `Normal` style defined at
# 12 pt. Pandoc inherits the style, not the direct formatting, so an export made against the
# unmodified template silently comes out at 12 pt.
#
# The original template is not touched. The same correction must be made in Word on the
# working copy, or the assembled document will be 12 pt too.
#
# Updates styles.xml in place inside the archive. An earlier version extracted and re-zipped,
# which produced entry names separated by backslashes instead of the forward slashes the ZIP
# specification requires — readable by pandoc, but not something to hand to Word.

param(
  [Parameter(Mandatory = $true)][string]$Path,
  [int]$PointSize = 11
)

Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression

$halfPoints = $PointSize * 2
$zip = [System.IO.Compression.ZipFile]::Open($Path, 'Update')
try {
  $entry = $zip.GetEntry('word/styles.xml')
  if (-not $entry) { throw "word/styles.xml not found in $Path" }

  $reader = New-Object System.IO.StreamReader($entry.Open())
  $xml = $reader.ReadToEnd()
  $reader.Close()

  # Confine the edit to the Normal style block. Match on the style's *name* rather than its
  # id: Word names it "Normal", but WPS Office numbers its styles, so a document saved there
  # carries the same style under an id such as "1".
  $m = [regex]::Match($xml, '<w:style [^>]*>(?:(?!</w:style>).)*?<w:name w:val="Normal"/>.*?</w:style>', 'Singleline')
  if (-not $m.Success) { throw 'Normal style block not found' }

  $before = $m.Value
  $after = $before -replace '<w:sz w:val="\d+"\s*/>', "<w:sz w:val=`"$halfPoints`"/>"
  $after = $after -replace '<w:szCs w:val="\d+"\s*/>', "<w:szCs w:val=`"$halfPoints`"/>"
  if ($before -eq $after) { throw 'no size element inside Normal to patch' }

  $xml = $xml.Replace($before, $after)

  # Truncate and rewrite the entry in place.
  $stream = $entry.Open()
  $stream.SetLength(0)
  $writer = New-Object System.IO.StreamWriter($stream, (New-Object System.Text.UTF8Encoding($false)))
  $writer.Write($xml)
  $writer.Flush()
  $writer.Close()

  Write-Output "  Normal style set to $PointSize pt in $(Split-Path $Path -Leaf)"
}
finally {
  $zip.Dispose()
}
