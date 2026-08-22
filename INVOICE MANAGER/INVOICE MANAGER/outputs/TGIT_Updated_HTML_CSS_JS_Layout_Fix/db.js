(function () {
  "use strict";

  const DB_NAME = "tgit_bulk_invoice_generator";
  const DB_VERSION = 2;
  let dbPromise;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("invoices")) db.createObjectStore("invoices", { keyPath: "invoiceNo" });
        if (!db.objectStoreNames.contains("history")) db.createObjectStore("history", { keyPath: "invoiceNo" });
        if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "key" });
        if (!db.objectStoreNames.contains("register")) db.createObjectStore("register", { keyPath: "invoiceNo" });
        if (!db.objectStoreNames.contains("files")) db.createObjectStore("files", { keyPath: "key" });
        if (!db.objectStoreNames.contains("productMaster")) db.createObjectStore("productMaster", { keyPath: "name" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return dbPromise;
  }

  async function tx(store, mode, action) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(store, mode);
      const objectStore = transaction.objectStore(store);
      let result;
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
      result = action(objectStore);
    });
  }

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function put(store, value) {
    return tx(store, "readwrite", (s) => s.put(value));
  }

  async function get(store, key) {
    const db = await openDB();
    const transaction = db.transaction(store, "readonly");
    return requestToPromise(transaction.objectStore(store).get(key));
  }

  async function getAll(store) {
    const db = await openDB();
    const transaction = db.transaction(store, "readonly");
    return requestToPromise(transaction.objectStore(store).getAll());
  }

  async function remove(store, key) {
    return tx(store, "readwrite", (s) => s.delete(key));
  }

  async function saveInvoice(invoice, status) {
    const now = TGITUtils.todayParts();
    const record = { ...invoice, generatedDate: now.date, generatedTime: now.time, status: status || "Generated" };
    await put("invoices", record);
    await put("history", { invoiceNo: record.invoiceNo, invoiceDate: record.invoiceDate, customerName: record.customerName, gstNumber: record.gstNumber, grandTotal: record.grandTotal, savedAt: new Date().toISOString() });
    await put("register", toRegisterRow(record));
    return record;
  }

  async function deleteInvoice(invoiceNo) {
    await remove("invoices", invoiceNo);
    await remove("history", invoiceNo);
    await remove("register", invoiceNo);
  }

  async function saveProduct(product) {
    const name = TGITUtils.clean(product.name || product.description);
    if (!name) return null;
    const record = {
      name,
      hsn: TGITUtils.clean(product.hsn),
      gstRate: TGITUtils.numberValue(product.gstRate),
      rate: TGITUtils.numberValue(product.rate),
      updatedAt: new Date().toISOString()
    };
    await put("productMaster", record);
    return record;
  }

  async function saveProductsFromInvoice(invoice) {
    for (const item of invoice.items || []) {
      if (TGITUtils.clean(item.description)) {
        await saveProduct({
          name: item.description,
          hsn: item.hsn,
          gstRate: item.cgstRate ? TGITUtils.numberValue(item.cgstRate) * 2 : TGITUtils.numberValue(item.gstRate),
          rate: item.rate
        });
      }
    }
  }

  function toRegisterRow(invoice) {
    return {
      invoiceNo: invoice.invoiceNo,
      "Invoice No": invoice.invoiceNo,
      "Invoice Date": TGITUtils.fileDate(invoice.invoiceDate),
      "Customer Name": TGITUtils.clean(invoice.customerName),
      "GST Number": TGITUtils.clean(invoice.gstNumber),
      "Address": TGITUtils.clean(invoice.address),
      "Reference Number": TGITUtils.clean(invoice.reference),
      "Taxable Amount": TGITUtils.numberValue(invoice.taxableAmount),
      "CGST": TGITUtils.numberValue(invoice.cgstAmount),
      "SGST": TGITUtils.numberValue(invoice.sgstAmount),
      "Round Off": TGITUtils.numberValue(invoice.roundOff),
      "Grand Total": TGITUtils.numberValue(invoice.grandTotal),
      "PDF File Name": TGITUtils.invoiceFileName(invoice),
      "Generated Date": invoice.generatedDate || TGITUtils.todayParts().date,
      "Generated Time": invoice.generatedTime || TGITUtils.todayParts().time,
      "Status": invoice.status || "Generated"
    };
  }

  async function getSettings() {
    const saved = await get("settings", "company");
    const local = JSON.parse(localStorage.getItem("tgit_settings") || "{}");
    return { ...TGITUtils.COMPANY_DEFAULTS, ...local, ...(saved ? saved.value : {}) };
  }

  async function saveSettings(settings) {
    const merged = { ...TGITUtils.COMPANY_DEFAULTS, ...settings };
    localStorage.setItem("tgit_settings", JSON.stringify(merged));
    await put("settings", { key: "company", value: merged });
    return merged;
  }

  async function saveRegisterHandle(handle) {
    await put("files", { key: "registerHandle", handle });
  }

  async function getRegisterHandle() {
    const row = await get("files", "registerHandle");
    return row ? row.handle : null;
  }

  window.TGITDB = {
    openDB,
    put,
    get,
    getAll,
    remove,
    saveInvoice,
    deleteInvoice,
    getSettings,
    saveSettings,
    saveProduct,
    saveProductsFromInvoice,
    toRegisterRow,
    saveRegisterHandle,
    getRegisterHandle
  };
})();
