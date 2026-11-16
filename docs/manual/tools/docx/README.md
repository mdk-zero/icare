# Printable manual

`build.mjs` makes `docs/manual/iCARE-User-Manual.docx`, the copy of this manual for printing,
from the Markdown guides in `docs/manual/`. Change the guides, then rebuild; never edit the .docx
by hand, because the next build replaces it.

The document has:

- a cover and a table of contents;
- one chapter per guide, in this order: About this manual, Getting started, Common tasks, Admin,
  Dean, Program Chair, Instructor, Student, then Setting up and running iCARE++;
- numbered chapters and sections (4, 4.3), and figures numbered by chapter (Figure 4.3);
- page references in place of links ("Create an account (page 44)"), and "Chapter 5" for links
  to a whole guide;
- Notes and Important callouts as shaded boxes, and every screenshot at print size: web shots up
  to the text width, phone shots at phone size;
- US Letter (short bond) pages with 1 in margins and a 0.25 in binding gutter, the chapter title
  in the header, and page numbers in the footer from Chapter 1.

## Build

From the repo root:

```sh
node docs/manual/tools/docx/build.mjs                 # writes docs/manual/iCARE-User-Manual.docx
node docs/manual/tools/docx/build.mjs --out other.docx
```

It needs no installs: it uses `markdown-it` from `mobile/node_modules` and `jszip` from
`web/node_modules`. It stops if an image is missing or if a print-only wording change no longer
matches (`PRINT_EDITS` at the top of the script), and warns about links with no target.

## Fill in the contents and page numbers

The table of contents and the page references are Word fields. A fresh build asks Word to fill
them in when the file opens ("This document contains fields that may refer to other files…":
choose **Yes**).

To ship the file already filled in, run `refresh.ps1` on Windows with Microsoft Word. It updates
every field twice (the contents move page numbers), saves the .docx, and can export a PDF. Word
can't open files from the WSL file system reliably, so copy the file to a Windows folder first:

```sh
D=$(wslpath "$(powershell.exe -NoProfile -Command '[IO.Path]::GetTempPath()' | tr -d '\r')")/icare-manual
mkdir -p "$D" && cp docs/manual/iCARE-User-Manual.docx docs/manual/tools/docx/refresh.ps1 "$D/"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command \
  '$d = Join-Path $env:TEMP "icare-manual"; & "$d\refresh.ps1" -Docx "$d\iCARE-User-Manual.docx" -Pdf "$d\iCARE-User-Manual.pdf"'
cp "$D/iCARE-User-Manual.docx" docs/manual/
```

The script prints the page count. Commit the refreshed .docx with the guide changes it reflects.
