(function () {
  "use strict";

  const U = window.TGITUtils;
  let settings = U.COMPANY_DEFAULTS;
  let products = [];
  let editingOriginalNo = "";

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    settings = await TGITDB.getSettings();
    products = await TGITDB.getAll("productMaster");
    renderProductSuggestions();
    bindEvents();

    const params = new URLSearchParams(location.search);
    const invoiceNo = params.get("invoice");
    const duplicate = params.get("duplicate") === "1";
    if (invoiceNo) {
      const invoice = await TGITDB.get("invoices", invoiceNo);
      if (invoice) loadInvoice(invoice, duplicate);
    } else {
      byId("invoiceDate").valueAsDate = new Date();
      addProductRow();
    }
    updatePreview();
  }

  function bindEvents() {
    byId("manualForm").addEventListener("submit", saveManualInvoice);
    byId("addProductRow").addEventListener("click", () => addProductRow());
    byId("productRows").addEventListener("input", handleProductInput);
    byId("productRows").addEventListener("change", handleProductChange);
    byId("saveMasterProduct").addEventListener("click", saveMasterProduct);
    byId("masterName").addEventListener("change", fillMasterEditor);
    byId("printNow").addEventListener("click", () => window.print());
    byId("downloadNow").addEventListener("click", async () => TGITPDF.downloadInvoice(buildInvoice(), settings));
    byId("duplicateInvoice").addEventListener("click", duplicateCurrent);
    byId("deleteInvoice").addEventListener("click", deleteCurrent);
    byId("exportRegisterManual").addEventListener("click", exportRegister);
    ["invoiceNo", "invoiceDate", "customerName", "gstNumber", "address", "reference"].forEach((id) => {
      byId(id).addEventListener("input", updatePreview);
    });
  }

  function loadInvoice(invoice, duplicate) {
    editingOriginalNo = duplicate ? "" : invoice.invoiceNo;
    byId("invoiceNo").value = duplicate ? invoice.invoiceNo + "-COPY" : invoice.invoiceNo;
    byId("invoiceDate").value = toInputDate(invoice.invoiceDate);
    byId("customerName").value = U.clean(invoice.customerName);
    byId("gstNumber").value = U.clean(invoice.gstNumber);
    byId("address").value = U.clean(invoice.address);
    byId("reference").value = U.clean(invoice.reference);
    byId("productRows").innerHTML = "";
    (invoice.items || []).forEach((item) => addProductRow(item));
    if (!(invoice.items || []).length) addProductRow();
    byId("deleteInvoice").disabled = duplicate;
  }

  function addProductRow(item) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input class="p-desc" list="productSuggestions" value="${U.escapeHtml(item?.description || "")}"></td>
      <td><input class="p-hsn" value="${U.escapeHtml(item?.hsn || "")}"></td>
      <td><input class="p-qty" type="number" min="0" step="0.01" value="${item?.qty || ""}"></td>
      <td><input class="p-rate" type="number" min="0" step="0.01" value="${item?.rate || ""}"></td>
      <td><input class="p-gst" type="number" min="0" step="0.01" value="${item?.gstRate || ((item?.cgstRate || 0) + (item?.sgstRate || 0)) || ""}"></td>
      <td class="calc p-taxable"></td>
      <td class="calc p-cgst"></td>
      <td class="calc p-sgst"></td>
      <td class="calc p-total"></td>
      <td><button class="row-remove" type="button" title="Remove">×</button></td>`;
    tr.querySelector(".row-remove").addEventListener("click", () => {
      tr.remove();
      if (!byId("productRows").children.length) addProductRow();
      updatePreview();
    });
    byId("productRows").appendChild(tr);
    calculateRow(tr);
    updatePreview();
  }

  function handleProductInput(event) {
    const row = event.target.closest("tr");
    if (!row) return;
    if (event.target.classList.contains("p-desc")) fillFromProductMaster(row, event.target.value);
    calculateRow(row);
    updatePreview();
  }

  function handleProductChange(event) {
    const row = event.target.closest("tr");
    if (!row) return;
    if (event.target.classList.contains("p-desc")) fillFromProductMaster(row, event.target.value);
    calculateRow(row);
    updatePreview();
  }

  function fillFromProductMaster(row, name) {
    const product = products.find((p) => p.name.toLowerCase() === U.clean(name).toLowerCase());
    if (!product) return;
    if (!U.clean(row.querySelector(".p-hsn").value)) row.querySelector(".p-hsn").value = product.hsn || "";
    if (!U.numberValue(row.querySelector(".p-rate").value)) row.querySelector(".p-rate").value = product.rate || "";
    if (!U.numberValue(row.querySelector(".p-gst").value)) row.querySelector(".p-gst").value = product.gstRate || "";
  }

  function calculateRow(row) {
    const qty = U.numberValue(row.querySelector(".p-qty").value);
    const rate = U.numberValue(row.querySelector(".p-rate").value);
    const gst = U.numberValue(row.querySelector(".p-gst").value);
    const taxable = qty * rate;
    const cgst = taxable * (gst / 2) / 100;
    const sgst = taxable * (gst / 2) / 100;
    row.querySelector(".p-taxable").textContent = U.money(taxable);
    row.querySelector(".p-cgst").textContent = U.money(cgst);
    row.querySelector(".p-sgst").textContent = U.money(sgst);
    row.querySelector(".p-total").textContent = U.money(taxable + cgst + sgst);
  }

  function buildInvoice() {
    const items = Array.from(byId("productRows").querySelectorAll("tr")).map((row) => {
      const qty = U.numberValue(row.querySelector(".p-qty").value);
      const rate = U.numberValue(row.querySelector(".p-rate").value);
      const gstRate = U.numberValue(row.querySelector(".p-gst").value);
      const taxable = qty * rate;
      const cgstAmount = taxable * (gstRate / 2) / 100;
      const sgstAmount = taxable * (gstRate / 2) / 100;
      return {
        description: U.clean(row.querySelector(".p-desc").value),
        hsn: U.clean(row.querySelector(".p-hsn").value),
        qty,
        rate,
        gstRate,
        taxable,
        cgstRate: gstRate / 2,
        sgstRate: gstRate / 2,
        cgstAmount,
        sgstAmount,
        total: taxable + cgstAmount + sgstAmount
      };
    }).filter((item) => item.description || item.hsn || item.qty || item.rate);

    const taxableAmount = round2(items.reduce((sum, item) => sum + item.taxable, 0));
    const cgstAmount = round2(items.reduce((sum, item) => sum + item.cgstAmount, 0));
    const sgstAmount = round2(items.reduce((sum, item) => sum + item.sgstAmount, 0));
    const subTotal = round2(taxableAmount + cgstAmount + sgstAmount);
    const grandTotal = Math.round(subTotal);
    const roundOff = round2(grandTotal - subTotal);
    const first = items.find((item) => item.gstRate);
    return {
      invoiceNo: U.clean(byId("invoiceNo").value),
      invoiceDate: byId("invoiceDate").value,
      customerName: U.clean(byId("customerName").value),
      gstNumber: U.clean(byId("gstNumber").value),
      address: U.clean(byId("address").value),
      reference: U.clean(byId("reference").value),
      items,
      taxableAmount,
      cgstAmount,
      sgstAmount,
      cgstRate: first ? first.cgstRate : 0,
      sgstRate: first ? first.sgstRate : 0,
      subTotal,
      roundOff,
      grandTotal,
      balance: grandTotal,
      amountWords: U.amountInWordsIndian(grandTotal),
      source: "manual"
    };
  }

  function updatePreview() {
    const invoice = buildInvoice();
    updateTotals(invoice);
    byId("manualPreview").innerHTML = invoice.invoiceNo || invoice.items.length
      ? TGITInvoice.renderInvoice(invoice, settings)
      : "<div class='empty-state'>Enter invoice details to preview.</div>";
  }

  function updateTotals(invoice) {
    byId("taxableAmount").value = U.money(invoice.taxableAmount);
    byId("cgstAmount").value = U.money(invoice.cgstAmount);
    byId("sgstAmount").value = U.money(invoice.sgstAmount);
    byId("subTotal").value = U.money(invoice.subTotal);
    byId("roundOff").value = U.signedMoney(invoice.roundOff);
    byId("grandTotal").value = U.money(invoice.grandTotal);
    byId("balance").value = U.money(invoice.balance);
    byId("amountWords").value = invoice.amountWords;
  }

  async function saveManualInvoice(event) {
    event.preventDefault();
    const invoice = buildInvoice();
    if (!invoice.invoiceNo || !invoice.invoiceDate || !invoice.customerName) {
      flash("Invoice number, date, and customer name are required.");
      return;
    }
    if (!invoice.items.length) {
      flash("Add at least one product row.");
      return;
    }
    const existing = await TGITDB.get("invoices", invoice.invoiceNo);
    if (existing && invoice.invoiceNo !== editingOriginalNo && !confirm("Invoice Number already exists. Choose OK to Overwrite, or Cancel to Skip.")) {
      return;
    }
    if (editingOriginalNo && editingOriginalNo !== invoice.invoiceNo) await TGITDB.deleteInvoice(editingOriginalNo);
    const saved = await TGITDB.saveInvoice(invoice, existing ? "Manual Updated" : "Manual Created");
    await TGITDB.saveProductsFromInvoice(saved);
    products = await TGITDB.getAll("productMaster");
    renderProductSuggestions();
    await syncRegister(saved);
    editingOriginalNo = saved.invoiceNo;
    byId("deleteInvoice").disabled = false;
    if (!byId("manualStatus").textContent.includes("Export")) flash("Invoice saved permanently.");
  }

  async function syncRegister(invoice) {
    const row = TGITDB.toRegisterRow(invoice);
    try {
      const updated = await TGITExcel.appendToSelectedRegister([row]);
      if (!updated) flash("Invoice saved. Use Export Invoice_Register.xlsx to synchronize the register.");
    } catch (error) {
      console.warn(error);
      flash("Invoice saved. Register file was not updated; use Export from Dashboard.");
    }
  }

  async function exportRegister() {
    const rows = await TGITDB.getAll("register");
    await TGITExcel.exportRegisterXlsx(rows);
    flash("Invoice_Register.xlsx exported.");
  }

  function duplicateCurrent() {
    editingOriginalNo = "";
    byId("invoiceNo").value = U.clean(byId("invoiceNo").value) + "-COPY";
    byId("deleteInvoice").disabled = true;
    updatePreview();
    flash("Duplicate ready. Change the invoice number before saving if needed.");
  }

  async function deleteCurrent() {
    const invoiceNo = editingOriginalNo || U.clean(byId("invoiceNo").value);
    if (!invoiceNo) return;
    if (!confirm("Delete invoice " + invoiceNo + "?")) return;
    await TGITDB.deleteInvoice(invoiceNo);
    flash("Invoice deleted from IndexedDB history and register storage.");
    setTimeout(() => location.href = "index.html", 700);
  }

  function renderProductSuggestions() {
    byId("productSuggestions").innerHTML = products
      .map((product) => `<option value="${U.escapeHtml(product.name)}"></option>`)
      .join("");
  }

  function fillMasterEditor() {
    const name = U.clean(byId("masterName").value).toLowerCase();
    const product = products.find((p) => p.name.toLowerCase() === name);
    if (!product) return;
    byId("masterHsn").value = product.hsn || "";
    byId("masterGst").value = product.gstRate || "";
    byId("masterRate").value = product.rate || "";
  }

  async function saveMasterProduct() {
    const product = await TGITDB.saveProduct({
      name: byId("masterName").value,
      hsn: byId("masterHsn").value,
      gstRate: byId("masterGst").value,
      rate: byId("masterRate").value
    });
    if (!product) {
      flash("Enter a product name before saving Product Master.");
      return;
    }
    products = await TGITDB.getAll("productMaster");
    renderProductSuggestions();
    flash("Product Master saved.");
  }

  function toInputDate(value) {
    const d = U.parseDate(value) || new Date();
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
  }

  function round2(value) {
    return Math.round((U.numberValue(value) + Number.EPSILON) * 100) / 100;
  }

  function flash(message) {
    byId("manualStatus").textContent = message;
  }

  function byId(id) {
    return document.getElementById(id);
  }
})();
