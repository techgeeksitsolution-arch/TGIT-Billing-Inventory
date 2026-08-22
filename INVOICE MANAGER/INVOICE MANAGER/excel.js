(function () {
  "use strict";

  const U = window.TGITUtils;

  function readWorkbook(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = new Uint8Array(event.target.result);
          const workbook = XLSX.read(data, { type: "array", cellDates: true });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true });
          resolve(normalizeInvoices(rows));
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  function normalizeInvoices(rows) {
    const invoices = [];
    let current = null;

    rows.forEach((row) => {
      const billNo = U.clean(U.getColumn(row, ["BILL NO", "Invoice No", "Invoice Number"]));
      if (billNo) {
        if (current) finalizeInvoice(current);
        current = {
          invoiceNo: billNo,
          invoiceDate: U.getColumn(row, ["SELLING DATE", "Invoice Date", "DATE"]),
          customerName: U.getColumn(row, ["CUSTOMER NAME", "Bill To", "Customer"]),
          gstNumber: U.getColumn(row, ["GST NUMBER", "Customer GST Number", "GSTIN"]),
          address: U.getColumn(row, ["ADDRESS", "Customer Address"]),
          reference: U.getColumn(row, ["REFERENCE", "Reference", "Reference Number", "REF"]),
          items: [],
          sourceRows: 0
        };
        invoices.push(current);
      }

      if (!current) return;
      current.sourceRows += 1;
      const description = U.clean(U.getColumn(row, ["ITEM DESCRIPTION", "Product Description", "DESCRIPTION", "ITEM"]));
      const hsn = U.clean(U.getColumn(row, ["HSN CODE", "HSN/SAC", "HSN", "SAC"]));
      const qty = U.numberValue(U.getColumn(row, ["QTY", "Quantity"]));
      const rate = U.numberValue(U.getColumn(row, ["RATE", "AMOUNT", "Taxable Value"]));
      const taxable = U.numberValue(U.getColumn(row, ["Taxable Value", "TAXABLE AMOUNT", "AMOUNT", "RATE"]));
      const cgstRate = U.numberValue(U.getColumn(row, ["CGST", "CGST Rate"]));
      const sgstRate = U.numberValue(U.getColumn(row, ["SGST", "SGST Rate"]));
      const cgstAmount = U.numberValue(U.getColumn(row, ["CGST Amount", "CGST AMOUNT"]));
      const sgstAmount = U.numberValue(U.getColumn(row, ["SGST Amount", "SGST AMOUNT"]));
      const total = U.numberValue(U.getColumn(row, ["TOTAL", "Bill Total", "TOTAL AMOUNT", "Bill Incl GST"]));

      if (description || hsn || qty || rate || taxable || total) {
        current.items.push({
          description,
          hsn,
          qty,
          rate,
          taxable: taxable || rate * (qty || 1),
          cgstRate,
          sgstRate,
          cgstAmount,
          sgstAmount,
          total: total || taxable + cgstAmount + sgstAmount
        });
      }

      const grand = U.numberValue(U.getColumn(row, ["TOTAL BILL AMOUNT", "Grand Total", "Bill Incl GST"]));
      if (grand) current.grandTotal = grand;
      const roundOff = U.getColumn(row, ["Round off", "Round Off", "ROUNDOFF", "ROUND OFF"]);
      if (roundOff !== "" && roundOff !== null && roundOff !== undefined) current.roundOff = U.numberValue(roundOff);
    });

    if (current) finalizeInvoice(current);
    return invoices.filter((invoice) => U.clean(invoice.invoiceNo));
  }

  function finalizeInvoice(invoice) {
    const itemTaxable = invoice.items.reduce((sum, item) => sum + U.numberValue(item.taxable), 0);
    const itemCgst = invoice.items.reduce((sum, item) => sum + U.numberValue(item.cgstAmount), 0);
    const itemSgst = invoice.items.reduce((sum, item) => sum + U.numberValue(item.sgstAmount), 0);
    invoice.taxableAmount = round2(itemTaxable);
    invoice.cgstAmount = round2(itemCgst);
    invoice.sgstAmount = round2(itemSgst);
    invoice.cgstRate = firstRate(invoice.items, "cgstRate");
    invoice.sgstRate = firstRate(invoice.items, "sgstRate");
    invoice.subTotal = round2(itemTaxable + itemCgst + itemSgst);
    invoice.grandTotal = U.numberValue(invoice.grandTotal) || Math.round(invoice.subTotal);
    invoice.roundOff = invoice.roundOff !== undefined ? round2(invoice.roundOff) : round2(invoice.grandTotal - invoice.subTotal);
    invoice.balance = invoice.grandTotal;
    invoice.amountWords = U.amountInWordsIndian(invoice.grandTotal);
  }

  function firstRate(items, key) {
    const found = items.find((item) => U.numberValue(item[key]));
    return found ? U.numberValue(found[key]) : 0;
  }

  function round2(value) {
    return Math.round((U.numberValue(value) + Number.EPSILON) * 100) / 100;
  }

  async function exportRegisterXlsx(rows) {
    const ordered = rows.map(cleanRegisterRow);
    const sheet = XLSX.utils.json_to_sheet(ordered, { header: registerHeaders() });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Invoice Register");
    XLSX.writeFile(workbook, "Invoice_Register.xlsx");
  }

  function registerHeaders() {
    return [
      "Invoice No",
      "Invoice Date",
      "Customer Name",
      "GST Number",
      "Address",
      "Reference Number",
      "Taxable Amount",
      "CGST",
      "SGST",
      "Round Off",
      "Grand Total",
      "PDF File Name",
      "Generated Date",
      "Generated Time",
      "Status"
    ];
  }

  function cleanRegisterRow(row) {
    const out = {};
    registerHeaders().forEach((header) => out[header] = row[header] ?? "");
    return out;
  }

  async function appendToSelectedRegister(newRows) {
    if (!("showSaveFilePicker" in window)) {
      return false;
    }
    let handle = await TGITDB.getRegisterHandle();
    if (!handle) {
      handle = await window.showSaveFilePicker({
        suggestedName: "Invoice_Register.xlsx",
        types: [{ description: "Excel Workbook", accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] } }]
      });
      await TGITDB.saveRegisterHandle(handle);
    }
    const permission = await handle.requestPermission({ mode: "readwrite" });
    if (permission !== "granted") return;

    let existing = [];
    try {
      const file = await handle.getFile();
      if (file.size) {
        const data = new Uint8Array(await file.arrayBuffer());
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        existing = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      }
    } catch (_) {
      existing = [];
    }

    const positions = new Map(existing.map((row, index) => [U.clean(row["Invoice No"]), index]));
    newRows.forEach((row) => {
      const key = U.clean(row["Invoice No"]);
      if (positions.has(key)) existing[positions.get(key)] = cleanRegisterRow(row);
      else existing.push(cleanRegisterRow(row));
    });

    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(existing.map(cleanRegisterRow), { header: registerHeaders() });
    XLSX.utils.book_append_sheet(workbook, sheet, "Invoice Register");
    const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const writable = await handle.createWritable();
    await writable.write(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    await writable.close();
    return true;
  }

  window.TGITExcel = {
    readWorkbook,
    normalizeInvoices,
    exportRegisterXlsx,
    appendToSelectedRegister,
    registerHeaders
  };
})();
