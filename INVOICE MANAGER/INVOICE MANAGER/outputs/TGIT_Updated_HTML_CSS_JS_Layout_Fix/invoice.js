(function () {
  "use strict";

  const U = window.TGITUtils;

  function renderInvoice(invoice, settings) {
    const s = { ...U.COMPANY_DEFAULTS, ...(settings || {}) };
    const pages = splitItems(invoice.items || []);
    return pages.map((items, pageIndex) => renderInvoicePage(invoice, s, items, pageIndex, pages.length)).join("");
  }

  function renderInvoicePage(invoice, s, items, pageIndex, pageCount) {
    const isLastPage = pageIndex === pageCount - 1;
    const rows = buildItemRows(items, pageIndex);
    return `
      <section class="invoice-sheet invoice-container" data-invoice-no="${U.escapeHtml(invoice.invoiceNo)}">
        <div class="invoice-border">
          <header class="invoice-top">
            <div class="logo-cell">${s.logoDataUrl ? `<img src="${U.escapeHtml(s.logoDataUrl)}" alt="">` : ""}</div>
            <div class="company-cell">
              <h1>INVOICE</h1>
              <h2>${U.escapeHtml(s.companyName)}</h2>
              <p>${U.escapeHtml(s.address).replace(/\n/g, ", ")}</p>
              <p>Phone : ${U.escapeHtml(s.phone)}</p>
              <p>GSTIN : ${U.escapeHtml(s.gstin)}</p>
              <p>UDYAM : ${U.escapeHtml(s.udyam)}</p>
            </div>
          </header>

          <div class="meta-grid">
            <div class="bill-box">
              <div class="label">Bill To</div>
              <div class="customer">${U.escapeHtml(invoice.customerName)}</div>
              <div>${U.escapeHtml(invoice.address)}</div>
              <div class="gst-line">Customer GST Number : ${U.escapeHtml(invoice.gstNumber)}</div>
            </div>
            <div class="invoice-meta">
              <div><span>Invoice No.</span><b>: ${U.escapeHtml(invoice.invoiceNo)}</b></div>
              <div><span>Invoice Date</span><b>: ${U.escapeHtml(U.fileDate(invoice.invoiceDate))}</b></div>
              <div><span>Ref.</span><b>: ${U.escapeHtml(invoice.reference)}</b></div>
              ${pageCount > 1 ? `<div><span>Page</span><b>: ${pageIndex + 1} / ${pageCount}</b></div>` : ""}
            </div>
          </div>

          <table class="items-table">
            <thead>
              <tr>
                <th class="sr">Sr No.</th>
                <th class="desc">Product Description</th>
                <th class="hsn">HSN/SAC</th>
                <th class="qty">Quantity</th>
                <th class="rate">Rate</th>
                <th class="tax">Tax</th>
                <th class="amount">Amount</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>

          ${isLastPage ? `
          <div class="bottom-grid">
            <div class="note-box">
              <div>Please Note</div>
              <div class="words">Amount In Words : <b>${U.escapeHtml(invoice.amountWords || U.amountInWordsIndian(invoice.grandTotal))}</b></div>
              ${s.bankDetails ? `<pre>${U.escapeHtml(s.bankDetails)}</pre>` : ""}
            </div>
            <table class="summary-table">
              <tr><td>Base Amount</td><td>${U.money(invoice.taxableAmount)}</td></tr>
              <tr><td>(+) SGST: ${U.ratePercent(invoice.sgstRate)}</td><td>${U.money(invoice.sgstAmount)}</td></tr>
              <tr><td>(+) CGST: ${U.ratePercent(invoice.cgstRate)}</td><td>${U.money(invoice.cgstAmount)}</td></tr>
              <tr><td>SubTotal</td><td>${U.money(invoice.subTotal)}</td></tr>
              <tr><td>Round Off</td><td>${U.signedMoney(invoice.roundOff)}</td></tr>
              <tr><td>Grand Total</td><td>${U.money(invoice.grandTotal)}</td></tr>
              <tr><td>Balance</td><td>${U.money(invoice.balance)}</td></tr>
            </table>
          </div>

          <footer class="invoice-footer">
            <div></div>
            <div class="signature-box">
              ${s.signatureDataUrl ? `<img src="${U.escapeHtml(s.signatureDataUrl)}" alt="">` : ""}
              <span>Signature</span>
            </div>
          </footer>
          ` : ""}
        </div>
      </section>`;
  }

  function splitItems(items) {
    const maxRowsPerPage = 10;
    if (items.length <= maxRowsPerPage) return [items];
    const pages = [];
    for (let i = 0; i < items.length; i += maxRowsPerPage) {
      pages.push(items.slice(i, i + maxRowsPerPage));
    }
    return pages;
  }

  function buildItemRows(items, pageIndex) {
    const start = pageIndex * 10;
    const rows = items.map((item, index) => itemRow(item, start + index + 1));
    return rows.join("");
  }

  function itemRow(item, index) {
    const taxParts = [
      U.money((U.numberValue(item.cgstAmount) + U.numberValue(item.sgstAmount))),
      item.sgstRate ? "SGST : " + U.ratePercent(item.sgstRate) : "",
      item.cgstRate ? "CGST : " + U.ratePercent(item.cgstRate) : ""
    ].filter(Boolean);
    return `
      <tr>
        <td class="sr">${index}</td>
        <td class="desc">${U.escapeHtml(item.description)}</td>
        <td class="hsn">${U.escapeHtml(item.hsn)}</td>
        <td class="qty">${U.qty(item.qty)}</td>
        <td class="rate">${U.money(item.rate || item.taxable)}</td>
        <td class="tax">${taxParts.map(U.escapeHtml).join("<br>")}</td>
        <td class="amount">${U.money(item.total)}</td>
      </tr>`;
  }

  async function loadInvoiceFromQuery() {
    const params = new URLSearchParams(location.search);
    const id = params.get("invoice");
    if (!id) return null;
    return TGITDB.get("invoices", id);
  }

  window.TGITInvoice = {
    renderInvoice,
    loadInvoiceFromQuery
  };

  if (typeof document === "undefined") return;

  document.addEventListener("DOMContentLoaded", async () => {
    const host = document.getElementById("singleInvoiceHost");
    if (!host) return;
    const invoice = await loadInvoiceFromQuery();
    const settings = await TGITDB.getSettings();
    host.innerHTML = invoice ? renderInvoice(invoice, settings) : "<p class='empty-state'>Invoice not found.</p>";
  });
})();
