# Fills in the manual's table of contents, page references, header and page
# numbers with Word, saves the .docx, and can export a PDF of the same pages.
# Needs Windows with Microsoft Word. See README.md beside this file.
#
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File refresh.ps1 -Docx C:\path\manual.docx [-Pdf C:\path\manual.pdf]

param(
  [Parameter(Mandatory = $true)][string]$Docx,
  [string]$Pdf
)
$ErrorActionPreference = 'Stop'

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  $doc = $word.Documents.Open($Docx, $false, $false, $false)
  # Twice: filling in the contents moves pages, which moves page references.
  for ($pass = 0; $pass -lt 2; $pass++) {
    foreach ($toc in $doc.TablesOfContents) { $toc.Update() | Out-Null }
    $doc.Fields.Update() | Out-Null
    foreach ($section in $doc.Sections) {
      foreach ($h in $section.Headers) { $h.Range.Fields.Update() | Out-Null }
      foreach ($f in $section.Footers) { $f.Range.Fields.Update() | Out-Null }
    }
  }
  $doc.Save()
  if ($Pdf) { $doc.ExportAsFixedFormat($Pdf, 17) }  # 17 = PDF
  "pages: " + $doc.ComputeStatistics(2)               # 2 = pages
  $doc.Close($false)
}
finally {
  $word.Quit()
}
