(function () {
  "use strict";

  let invoices = [];
  let filtered = [];
  let currentIndex = 0;
  let settings = TGITUtils.COMPANY_DEFAULTS;

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    settings = await TGITDB.getSettings();
    invoices = await TGITDB.getAll("invoices");
    invoices.sort((a, b) => TGITUtils.clean(a.invoiceNo).localeCompare(TGITUtils.clean(b.invoiceNo), undefined, { numeric: true }));
    filtered = invoices.slice();
    bindEvents();
    updateUI();
  }

  function bindEvents() {
    byId("excelFile").addEventListener("change", handleExcel);
    byId("prevBtn").addEventListener("click", () => move(-1));
    byId("nextBtn").addEventListener("click", () => move(1));
    byId("search").addEventListener("input", applySearch);
    byId("printBtn").addEventListener("click", () => window.print());
    byId("downloadBtn").addEventListener("click", downloadCurrent);
    byId("editBtn").addEventListener("click", editCurrent);
    byId("duplicateBtn").addEventListener("click", duplicateCurrent);
    byId("deleteBtn").addEventListener("click", deleteCurrent);
    byId("allPdfBtn").addEventListener("click", downloadAll);
    byId("exportRegisterBtn").addEventListener("click", exportRegister);
    byId("selectRegisterBtn").addEventListener("click", selectRegister);
    byId("darkMode").addEventListener("change", (event) => document.documentElement.classList.toggle("dark", event.target.checked));
  }

  async function handleExcel(event) {
    const file = event.target.files[0];
    if (!file) return;
    setProgress(5, "Reading workbook...");
    const imported = await TGITExcel.readWorkbook(file);
    setProgress(35, "Checking duplicates...");
    const existing = new Set((await TGITDB.getAll("invoices")).map((invoice) => invoice.invoiceNo));
    const actions = await resolveDuplicates(imported.filter((invoice) => existing.has(invoice.invoiceNo)));
    const saved = [];
    for (let i = 0; i < imported.length; i += 1) {
      const invoice = imported[i];
      if (existing.has(invoice.invoiceNo) && actions[invoice.invoiceNo] === "skip") continue;
      const savedInvoice = await TGITDB.saveInvoice(invoice, existing.has(invoice.invoiceNo) ? "Overwritten" : "Generated");
      await TGITDB.saveProductsFromInvoice(savedInvoice);
      saved.push(TGITDB.toRegisterRow(savedInvoice));
      setProgress(35 + Math.round(((i + 1) / imported.length) * 45), "Saving invoices...");
    }
    if (saved.length) {
      try {
        const updated = await TGITExcel.appendToSelectedRegister(saved);
        if (!updated) setProgress(95, "Invoices saved. Export register when ready.");
      } catch (error) {
        console.warn(error);
        setProgress(95, "Invoices saved. Register file was not updated.");
      }
    }
    invoices = await TGITDB.getAll("invoices");
    filtered = invoices.slice();
    currentIndex = Math.max(0, filtered.length - saved.length);
    setProgress(100, saved.length + " invoice(s) generated.");
    updateUI();
  }

  async function resolveDuplicates(duplicates) {
    const actions = {};
    if (!duplicates.length) return actions;
    const list = duplicates.map((invoice) => invoice.invoiceNo).join(", ");
    const overwrite = confirm("Invoice Number already exists:\n" + list + "\n\nChoose OK to Overwrite all, or Cancel to Skip all.");
    duplicates.forEach((invoice) => actions[invoice.invoiceNo] = overwrite ? "overwrite" : "skip");
    return actions;
  }

  function applySearch() {
    const term = TGITUtils.clean(byId("search").value).toLowerCase();
    filtered = invoices.filter((invoice) => {
      const haystack = [
        invoice.invoiceNo,
        invoice.customerName,
        TGITUtils.fileDate(invoice.invoiceDate),
        invoice.gstNumber
      ].join(" ").toLowerCase();
      return haystack.includes(term);
    });
    currentIndex = 0;
    updateUI();
  }

  function move(delta) {
    if (!filtered.length) return;
    currentIndex = Math.min(filtered.length - 1, Math.max(0, currentIndex + delta));
    updateUI();
  }

  function currentInvoice() {
    return filtered[currentIndex] || null;
  }

  function updateUI() {
    byId("invoiceCount").textContent = invoices.length;
    byId("visibleCount").textContent = filtered.length;
    byId("position").textContent = filtered.length ? (currentIndex + 1) + " / " + filtered.length : "0 / 0";
    const invoice = currentInvoice();
    byId("preview").innerHTML = invoice ? TGITInvoice.renderInvoice(invoice, settings) : "<div class='empty-state'>Upload Sale Data.xlsx or search previous invoices.</div>";
    byId("prevBtn").disabled = currentIndex <= 0;
    byId("nextBtn").disabled = currentIndex >= filtered.length - 1;
    byId("printBtn").disabled = !invoice;
    byId("downloadBtn").disabled = !invoice;
    byId("editBtn").disabled = !invoice;
    byId("duplicateBtn").disabled = !invoice;
    byId("deleteBtn").disabled = !invoice;
    byId("allPdfBtn").disabled = !invoices.length;
  }

  async function downloadCurrent() {
    const invoice = currentInvoice();
    if (!invoice) return;
    await TGITPDF.downloadInvoice(invoice, settings);
  }

  function editCurrent() {
    const invoice = currentInvoice();
    if (!invoice) return;
    location.href = "manual.html?invoice=" + encodeURIComponent(invoice.invoiceNo);
  }

  function duplicateCurrent() {
    const invoice = currentInvoice();
    if (!invoice) return;
    location.href = "manual.html?invoice=" + encodeURIComponent(invoice.invoiceNo) + "&duplicate=1";
  }

  async function deleteCurrent() {
    const invoice = currentInvoice();
    if (!invoice) return;
    if (!confirm("Delete invoice " + invoice.invoiceNo + "?")) return;
    await TGITDB.deleteInvoice(invoice.invoiceNo);
    invoices = await TGITDB.getAll("invoices");
    filtered = invoices.slice();
    currentIndex = Math.min(currentIndex, Math.max(0, filtered.length - 1));
    setProgress(100, "Invoice deleted from local history and register storage.");
    updateUI();
  }

  async function downloadAll() {
    if (!invoices.length) return;
    const host = document.createElement("div");
    host.className = "pdf-render-host";
    document.body.appendChild(host);
    for (let i = 0; i < invoices.length; i += 1) {
      setProgress(Math.round((i / invoices.length) * 100), "Generating PDF " + (i + 1) + " of " + invoices.length);
      await TGITPDF.downloadInvoice(invoices[i], settings, host);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    host.remove();
    setProgress(100, "All PDF downloads started.");
  }

  async function exportRegister() {
    const rows = await TGITDB.getAll("register");
    await TGITExcel.exportRegisterXlsx(rows);
  }

  async function selectRegister() {
    if (!("showSaveFilePicker" in window)) {
      alert("File System Access API is unavailable in this browser. Use Export Register instead.");
      return;
    }
    const handle = await window.showSaveFilePicker({
      suggestedName: "Invoice_Register.xlsx",
      types: [{ description: "Excel Workbook", accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] } }]
    });
    await TGITDB.saveRegisterHandle(handle);
    alert("Invoice_Register.xlsx selected. Future imports will append automatically.");
  }

  function setProgress(value, label) {
    byId("progressBar").value = value;
    byId("progressText").textContent = label;
  }

  function byId(id) {
    return document.getElementById(id);
  }
})();
