# TGIT Bulk Invoice Generator

Offline GST invoice generator for Tech Geeks IT Solutions.

## Use

1. Open `index.html` in a browser.
2. Upload `Sale data.xlsx`, or open `Manual Entry` to create an invoice directly.
3. Preview, search, edit, duplicate, delete, print, download the current invoice, or generate all PDFs.
4. Use `Settings` to change company details, logo, signature, or bank details.

## Offline Files

The app uses only HTML5, CSS3, Vanilla JavaScript, and local copies of:

- SheetJS in `libs/xlsx.full.min.js`
- jsPDF in `libs/jspdf.umd.min.js`
- html2canvas in `libs/html2canvas.min.js`

No backend, Node server, or internet API is required at runtime.

## Data Storage

- Invoices, history, settings, and register rows are stored in IndexedDB.
- Product Master records are stored in IndexedDB and reused for manual autocomplete.
- Settings are also mirrored in Local Storage.
- `Invoice_Register.xlsx` is appended through the File System Access API when the browser supports it.
- If File System Access is unavailable, use `Export Invoice_Register.xlsx`.

## Excel Mapping

Rows with the same `BILL NO` are grouped into one invoice. Blank fields stay blank. The importer accepts the supplied workbook headings, including `AMOUNT`, `Taxable Value`, `CGST Rate`, `CGST Amount`, `SGST Rate`, `SGST Amount`, `Bill Total`, and `TOTAL BILL AMOUNT`.
