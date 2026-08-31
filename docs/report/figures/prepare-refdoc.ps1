# Prepare a Word document for use as pandoc's --reference-doc.
#
# Two problems arise when the reference document is a real, assembled report rather than an
# empty template:
#
# 1. Pandoc's docx writer emits paragraphs referencing the style ids `BodyText`, `Compact`,
#    `FirstParagraph` and `BlockText`. A School template written in Word — or saved from WPS
#    Office, which renumbers styles — usually defines none of them. The paragraphs then fall
#    back to the default style, which happens to give the right result but leaves the file
#    referencing styles it does not define. This adds them explicitly, based on Normal, so
#    body text inherits the template's font, size and line spacing by declaration rather than
#    by accident.
#
# 2. Pandoc copies the reference document's `word/media/` into the output. An assembled report
#    carries its own figures there, so the export ends up with every figure twice — once
#    genuinely embedded and once orphaned. This strips the media and its relationships from
#    the copy used as the reference; pandoc discards the reference document's body anyway.
#
# The original file is not modified — pass a copy.

param(
  [Parameter(Mandatory = $true)][string]$Path
)

Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression

$zip = [System.IO.Compression.ZipFile]::Open($Path, 'Update')
try {
  # --- 1. Declare the styles pandoc will reference -------------------------------------
  $entry = $zip.GetEntry('word/styles.xml')
  if (-not $entry) { throw "word/styles.xml not found in $Path" }

  $reader = New-Object System.IO.StreamReader($entry.Open())
  $xml = $reader.ReadToEnd()
  $reader.Close()

  # Find the default paragraph style so the new ones can inherit from it. Match on the
  # style's name: Word calls it "Normal", WPS gives it a numeric id.
  $normal = [regex]::Match($xml, '<w:style [^>]*w:styleId="([^"]+)"[^>]*>(?:(?!</w:style>).)*?<w:name w:val="Normal"/>', 'Singleline')
  if (-not $normal.Success) { throw 'Normal style not found' }
  $normalId = $normal.Groups[1].Value

  $wanted = @{
    'BodyText'       = 'Body Text'
    'Compact'        = 'Compact'
    'FirstParagraph' = 'First Paragraph'
    'BlockText'      = 'Block Text'
  }

  $added = @()
  foreach ($id in $wanted.Keys) {
    if ($xml -match "w:styleId=`"$id`"") { continue }
    $style = '<w:style w:type="paragraph" w:styleId="' + $id + '">' +
             '<w:name w:val="' + $wanted[$id] + '"/>' +
             '<w:basedOn w:val="' + $normalId + '"/>' +
             '<w:qFormat/></w:style>'
    $xml = $xml -replace '</w:styles>', ($style + '</w:styles>')
    $added += $id
  }

  $stream = $entry.Open()
  $stream.SetLength(0)
  $writer = New-Object System.IO.StreamWriter($stream, (New-Object System.Text.UTF8Encoding($false)))
  $writer.Write($xml)
  $writer.Flush()
  $writer.Close()

  if ($added.Count) {
    Write-Output ("  declared styles based on '{0}': {1}" -f $normalId, ($added -join ', '))
  } else {
    Write-Output '  all pandoc body styles already declared'
  }

  # --- 2. Strip the reference document's own figures ------------------------------------
  $media = @($zip.Entries | Where-Object { $_.FullName -like 'word/media/*' })
  $bytes = ($media | Measure-Object -Property Length -Sum).Sum
  foreach ($m in $media) { $m.Delete() }
  if ($media.Count) {
    Write-Output ("  removed {0} inherited media file(s), {1:N1} MB" -f $media.Count, ($bytes / 1MB))
  }
}
finally {
  $zip.Dispose()
}
