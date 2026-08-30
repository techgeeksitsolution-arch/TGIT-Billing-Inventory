import { useState, useEffect } from "react";
import { taxPercent, fmtPercent } from "../lib/invoiceTotals.js";
import { Letterhead, BankDetails } from "./Letterhead.jsx";

function numberToWords(num) {
  if (num === 0) return "Zero";
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  function cg(n) {
    if (n === 0) return "";
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
    return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " and " + cg(n % 100) : "");
  }
  const wp = Math.floor(num);
  const dp = Math.round((num - wp) * 100);
  let r = "";
  const cr = Math.floor(wp / 10000000);
  const la = Math.floor((wp % 10000000) / 100000);
  const th = Math.floor((wp % 100000) / 1000);
  const re = wp % 1000;
  if (cr) r += cg(cr) + " Crore ";
  if (la) r += cg(la) + " Lakh ";
  if (th) r += cg(th) + " Thousand ";
  if (re) r += cg(re);
  r = r.trim() + " Rupees";
  if (dp) r += " and " + cg(dp) + " Paise";
  return r + " Only";
}

const STATUS_LABELS = { DRAFT: "Draft", CONFIRMED: "Finalized", CANCELLED: "Cancelled" };

export default function PurchasePreview({ purchaseId, onBack, onEdit, onChanged }) {
  const [purchase, setPurchase] = useState(null);
  const [profile, setProfile] = useState({ name: "Tech Geeks IT Solution" });
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState(null);
  const [updateRate, setUpdateRate] = useState(false);

  const [attachments, setAttachments] = useState([]);
  const [ocrConfigured, setOcrConfigured] = useState(false);
  const [ocrJobs, setOcrJobs] = useState([]);
  const [ocrJob, setOcrJob] = useState(null);
  const [ocrBusy, setOcrBusy] = useState(false);

  const [payments, setPayments] = useState([]);
  const [payForm, setPayForm] = useState({ amount: 0, mode: "Cash", date: new Date().toISOString().slice(0, 10), reference: "", note: "" });

  const load = async () => {
    setLoading(true);
    const p = await fetch(`/api/v1/purchases/${purchaseId}`).then((r) => r.json());
    const pr = await fetch("/api/v1/settings/company-profile").then((r) => r.json());
    setPurchase(p); setProfile(pr); setPayments(p.payments || []); setLoading(false);
  };
  useEffect(() => { load(); }, [purchaseId]);

  const loadAttachments = async () => {
    const a = await fetch(`/api/v1/purchases/${purchaseId}/attachments`).then((r) => r.json());
    setAttachments(a.attachments || []);
  };
  const loadOcrConfig = async () => {
    const c = await fetch("/api/v1/settings/ocr-config").then((r) => r.json());
    setOcrConfigured(Boolean(c.configured));
  };
  const loadOcrJobs = async () => {
    const j = await fetch(`/api/v1/purchases/${purchaseId}/ocr`).then((r) => r.json());
    setOcrJobs(j.jobs || []);
  };
  useEffect(() => { if (purchase) { loadAttachments(); loadOcrConfig(); loadOcrJobs(); } }, [purchase]);

  const doFinalize = async () => {
    if (!confirm("Finalize this purchase? Stock will be added.")) return;
    setAction("finalizing");
    const res = await fetch(`/api/v1/purchases/${purchaseId}/finalize`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ updatePurchaseRate: updateRate }) });
    if (res.ok) { await load(); onChanged && onChanged(); }
    setAction(null);
  };
  const doCancel = async () => {
    if (!confirm("Cancel this finalized purchase? Stock will be reversed.")) return;
    setAction("cancelling");
    const res = await fetch(`/api/v1/purchases/${purchaseId}/cancel`, { method: "POST" });
    if (res.ok) { await load(); onChanged && onChanged(); }
    setAction(null);
  };

  const uploadAttachment = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData(); fd.append("file", file);
    await fetch(`/api/v1/purchases/${purchaseId}/attachments`, { method: "POST", body: fd });
    await loadAttachments();
  };
  const deleteAttachment = async (attId) => {
    if (!confirm("Delete this attachment?")) return;
    await fetch(`/api/v1/purchases/${purchaseId}/attachments/${attId}`, { method: "DELETE" });
    await loadAttachments();
  };
  const runOcr = async (attId) => {
    setOcrBusy(true);
    const j = await fetch(`/api/v1/purchases/${purchaseId}/ocr`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attachmentId: attId }) }).then((r) => r.json());
    setOcrJobs((prev) => [j.job, ...prev]);
    await openJob(j.job.id);
    setOcrBusy(false);
  };
  const openJob = async (jobId) => {
    const j = await fetch(`/api/v1/purchases/ocr/${jobId}`).then((r) => r.json());
    setOcrJob(j);
  };
  const applyOcr = async () => {
    if (!ocrJob) return;
    const data = ocrJob.extractedData || {};
    const payload = {
      supplierId: purchase.supplierId, supplierInvoiceNo: data.supplierInvoiceNo || purchase.supplierInvoiceNo || "",
      invoiceDate: data.invoiceDate || purchase.invoiceDate, taxMode: data.taxMode || "NON_GST",
      roundOffMode: "NEAREST",
      items: (data.items || []).map((it) => ({ description: it.description, hsnCode: it.hsnCode || "", quantity: Number(it.quantity) || 1, unitPrice: Number(it.unitPrice) || 0, uom: it.uom || "Nos", taxRatePercent: Number(it.taxRatePercent) || 0 })),
    };
    const res = await fetch(`/api/v1/purchases/ocr/${ocrJob.id}/apply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const out = await res.json();
    if (res.ok) alert(`OCR applied — draft purchase ${out.internalNumber} created.`);
    else alert("Apply failed: " + (out.error?.message || "error"));
  };

  const addPayment = async () => {
    const res = await fetch(`/api/v1/purchases/${purchaseId}/payments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: Number(payForm.amount), mode: payForm.mode, date: payForm.date, reference: payForm.reference || null, note: payForm.note || null }) });
    if (res.ok) { const p = await res.json(); setPayments((prev) => [...prev, p.payment]); setPayForm({ amount: 0, mode: "Cash", date: new Date().toISOString().slice(0, 10), reference: "", note: "" }); await load(); onChanged && onChanged(); }
  };
  const deletePayment = async (pid) => {
    if (!confirm("Delete this payment?")) return;
    await fetch(`/api/v1/purchases/${purchaseId}/payments/${pid}`, { method: "DELETE" });
    setPayments((prev) => prev.filter((p) => p.id !== pid));
    await load(); onChanged && onChanged();
  };

  if (loading || !purchase) return <div className="loading">Loading…</div>;

  const inv = purchase;
  const isGST = inv.taxMode === "INTRA_STATE_GST" || inv.taxMode === "INTER_STATE_GST";
  const otherCharges = Number(inv.otherCharges) || 0;
  const discountTotal = (inv.items || []).reduce((s, it) => s + (Number(it.discount) || 0) * (Number(it.quantity) || 1), 0);

  return (
    <div className="page">
      <div className="page-header no-print">
        <h1>Purchase {inv.internalNumber}</h1>
        <div className="header-actions">
          {inv.status === "DRAFT" && (
            <>
              <label style={{ display: "flex", gap: 4, alignItems: "center" }}><input type="checkbox" checked={updateRate} onChange={(e) => setUpdateRate(e.target.checked)} />Update purchase rate</label>
              <button className="btn btn-primary" onClick={doFinalize} disabled={action}>{action ? "Finalizing..." : "Finalize & Add Stock"}</button>
              <button className="btn btn-outline" onClick={() => onEdit && onEdit(inv.id)}>Edit</button>
            </>
          )}
          {inv.status === "CONFIRMED" && (
            <button className="btn btn-danger" onClick={doCancel} disabled={action}>{action ? "Cancelling..." : "Cancel Purchase"}</button>
          )}
          <button className="btn btn-outline" onClick={() => window.print()}>Print / PDF</button>
          <button className="btn btn-outline" onClick={onBack}>Back to List</button>
        </div>
      </div>

      <div className="invoice-print-area" id="purchase-print">
        <div className="invoice-paper">
          <Letterhead profile={profile} title="PURCHASE INVOICE" status={inv.status} statusLabel={STATUS_LABELS[inv.status]} />

          <div className="invoice-meta-grid">
            <div className="meta-group">
              <div className="meta-row"><span className="meta-label">Invoice No:</span><span className="meta-value mono">{inv.internalNumber}</span></div>
              <div className="meta-row"><span className="meta-label">Date:</span><span className="meta-value">{new Date(inv.invoiceDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span></div>
              <div className="meta-row"><span className="meta-label">Tax Mode:</span><span className="meta-value">{inv.taxMode.replace(/_/g, " ")}</span></div>
              {inv.placeOfSupply && <div className="meta-row"><span className="meta-label">Place of Supply:</span><span className="meta-value">{inv.placeOfSupply}</span></div>}
              {inv.supplierInvoiceNo && <div className="meta-row"><span className="meta-label">Supplier Inv No.:</span><span className="meta-value mono">{inv.supplierInvoiceNo}</span></div>}
            </div>
            <div className="meta-group">
              <div className="meta-row"><span className="meta-label">Bill From:</span><span className="meta-value">{inv.supplier?.name || "—"}</span></div>
              {inv.supplier?.contactPerson && <div className="meta-row"><span className="meta-label">Contact:</span><span className="meta-value">{inv.supplier.contactPerson}</span></div>}
              {inv.supplier?.address && <div className="meta-row"><span className="meta-label">Address:</span><span className="meta-value">{inv.supplier.address}</span></div>}
              {inv.supplier?.phone && <div className="meta-row"><span className="meta-label">Phone:</span><span className="meta-value">{inv.supplier.phone}</span></div>}
              {inv.supplier?.gstNumber && <div className="meta-row"><span className="meta-label">GSTIN:</span><span className="meta-value mono">{inv.supplier.gstNumber}</span></div>}
            </div>
          </div>

          {(inv.poNo || inv.challanNo || inv.lrNo || inv.ewayBillNo || inv.deliveryMode || inv.reverseCharge || inv.paymentMode) && (
            <div className="invoice-ref-grid no-print">
              {inv.poNo && <div className="meta-row"><span className="meta-label">PO No:</span><span className="meta-value">{inv.poNo}{inv.poDate ? ` (${new Date(inv.poDate).toLocaleDateString("en-IN")})` : ""}</span></div>}
              {inv.challanNo && <div className="meta-row"><span className="meta-label">Challan No:</span><span className="meta-value">{inv.challanNo}{inv.challanDate ? ` (${new Date(inv.challanDate).toLocaleDateString("en-IN")})` : ""}</span></div>}
              {inv.lrNo && <div className="meta-row"><span className="meta-label">LR No:</span><span className="meta-value">{inv.lrNo}</span></div>}
              {inv.ewayBillNo && <div className="meta-row"><span className="meta-label">E-Way Bill:</span><span className="meta-value">{inv.ewayBillNo}</span></div>}
              {inv.deliveryMode && <div className="meta-row"><span className="meta-label">Delivery:</span><span className="meta-value">{inv.deliveryMode}</span></div>}
              {inv.paymentMode && <div className="meta-row"><span className="meta-label">Payment Mode:</span><span className="meta-value">{inv.paymentMode}</span></div>}
              {inv.reverseCharge && <div className="meta-row"><span className="meta-label">RCM:</span><span className="meta-value">Reverse Charge</span></div>}
            </div>
          )}

          <table className="invoice-items-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Description</th>
                <th>HSN/SAC</th>
                <th className="r">UOM</th>
                <th className="r">Qty</th>
                <th className="r">Rate (₹)</th>
                {discountTotal > 0 && <th className="r">Disc (₹)</th>}
                <th className="r">Taxable (₹)</th>
                {isGST && inv.taxMode === "INTRA_STATE_GST" && <>
                  <th className="r">CGST</th>
                  <th className="r">SGST</th>
                </>}
                {isGST && inv.taxMode === "INTER_STATE_GST" && <th className="r">IGST</th>}
                <th className="r">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              {inv.items?.map((item, idx) => (
                <tr key={item.id}>
                  <td>{idx + 1}</td>
                  <td>{item.description}</td>
                  <td className="mono">{item.hsnCode || "-"}</td>
                  <td className="r">{item.uom || "Nos"}</td>
                  <td className="r">{Number(item.quantity)}</td>
                  <td className="r">{Number(item.unitPrice).toFixed(2)}</td>
                  {discountTotal > 0 && <td className="r">{(Number(item.discount) || 0).toFixed(2)}</td>}
                  <td className="r">{Number(item.taxableValue).toFixed(2)}</td>
                  {isGST && inv.taxMode === "INTRA_STATE_GST" && <>
                    <td className="r">{Number(item.cgstAmount).toFixed(2)}<br /><small>{Number(item.cgstRate)}%</small></td>
                    <td className="r">{Number(item.sgstAmount).toFixed(2)}<br /><small>{Number(item.sgstRate)}%</small></td>
                  </>}
                  {isGST && inv.taxMode === "INTER_STATE_GST" && (
                    <td className="r">{Number(item.igstAmount).toFixed(2)}<br /><small>{Number(item.igstRate)}%</small></td>
                  )}
                  <td className="r bold">{Number(item.totalAmount).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="invoice-footer-section">
            <div className="amount-words">
              <strong>Amount in Words:</strong> {numberToWords(Number(inv.grandTotal))}
            </div>
            <div className="totals-summary">
              <div className="total-row"><span>Taxable Total</span><span>₹{Number(inv.taxableTotal).toFixed(2)}</span></div>
              {discountTotal > 0 && <div className="total-row"><span>Discount</span><span>₹{discountTotal.toFixed(2)}</span></div>}
              {isGST && inv.taxMode === "INTRA_STATE_GST" && <>
                <div className="total-row"><span>CGST ({fmtPercent(taxPercent(Number(inv.cgstTotal), Number(inv.taxableTotal)))}%)</span><span>₹{Number(inv.cgstTotal).toFixed(2)}</span></div>
                <div className="total-row"><span>SGST ({fmtPercent(taxPercent(Number(inv.sgstTotal), Number(inv.taxableTotal)))}%)</span><span>₹{Number(inv.sgstTotal).toFixed(2)}</span></div>
              </>}
              {isGST && inv.taxMode === "INTER_STATE_GST" && (
                <div className="total-row"><span>IGST ({fmtPercent(taxPercent(Number(inv.igstTotal), Number(inv.taxableTotal)))}%)</span><span>₹{Number(inv.igstTotal).toFixed(2)}</span></div>
              )}
              {otherCharges > 0 && <div className="total-row"><span>Other Charges</span><span>₹{otherCharges.toFixed(2)}</span></div>}
              <div className="total-row"><span>Total Tax</span><span>₹{Number(inv.totalTax).toFixed(2)}</span></div>
              {Number(inv.roundOff) !== 0 && <div className="total-row"><span>Round Off</span><span>₹{Number(inv.roundOff).toFixed(2)}</span></div>}
              <div className="total-row grand"><span>Grand Total</span><span>₹{Number(inv.grandTotal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></div>
            </div>
          </div>

          <div className="invoice-bottom">
            <BankDetails profile={profile} />
            <div className="authorized-signatory">
              <p>For {profile.name}</p>
              <div className="signature-line"></div>
              <p>Authorized Signatory</p>
            </div>
          </div>
        </div>
      </div>

      <div className="no-print" style={{ marginTop: 24 }}>
        <div className="panel">
          <h3>Payment Status: <span className={`badge ${(inv.paymentStatus || "UNPAID").toLowerCase()}`}>{inv.paymentStatus || "UNPAID"}</span></h3>
          <div className="totals-row"><span>Paid</span><span>₹{Number(inv.paidAmount || 0).toFixed(2)}</span></div>
          <div className="totals-row"><span>Due</span><span>₹{Number(inv.dueAmount || 0).toFixed(2)}</span></div>
          <h4>Payments</h4>
          {payments.length === 0 && <p className="muted">No payments recorded.</p>}
          <table className="data-table">
            <thead><tr><th>Date</th><th>Mode</th><th>Reference</th><th>Amount</th><th></th></tr></thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}><td>{new Date(p.paymentDate).toLocaleDateString("en-IN")}</td><td>{p.mode}</td><td>{p.reference || "—"}</td><td>₹{Number(p.amount).toFixed(2)}</td><td><button className="btn btn-sm btn-danger" onClick={() => deletePayment(p.id)}>✕</button></td></tr>
              ))}
            </tbody>
          </table>
          <div className="form-row" style={{ marginTop: 8 }}>
            <input type="number" placeholder="Amount" style={{ width: 120 }} value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} />
            <select value={payForm.mode} onChange={(e) => setPayForm({ ...payForm, mode: e.target.value })}>
              <option>Cash</option><option>Bank</option><option>UPI</option><option>Cheque</option><option>Credit</option>
            </select>
            <input type="date" value={payForm.date} onChange={(e) => setPayForm({ ...payForm, date: e.target.value })} />
            <input placeholder="Reference" value={payForm.reference} onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} />
            <button className="btn btn-primary" onClick={addPayment} disabled={!Number(payForm.amount)}>Add Payment</button>
          </div>
        </div>

        <div className="panel">
          <h3>Attachments {!ocrConfigured && <span className="muted">(OCR not configured)</span>}</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <input type="file" id={`att-${purchaseId}`} style={{ display: "none" }} onChange={uploadAttachment} />
            <button className="btn btn-outline" onClick={() => document.getElementById(`att-${purchaseId}`).click()}>Upload File</button>
          </div>
          {attachments.length === 0 && <p className="muted">No attachments.</p>}
          <ul className="attachment-list">
            {attachments.map((a) => (
              <li key={a.id}>
                <a href={`/api/v1/purchases/${purchaseId}/attachments/${a.id}/download`} target="_blank" rel="noreferrer">{a.fileName}</a>
                <span className="muted"> ({a.ocrJobId ? "OCR" : "file"})</span>
                {ocrConfigured && !a.ocrJobId && <button className="btn btn-sm" disabled={ocrBusy} onClick={() => runOcr(a.id)}>Run OCR</button>}
                <button className="btn btn-sm btn-danger" onClick={() => deleteAttachment(a.id)}>Delete</button>
              </li>
            ))}
          </ul>
        </div>

        {ocrJobs.length > 0 && (
          <div className="panel">
            <h3>OCR Jobs</h3>
            <ul className="attachment-list">
              {ocrJobs.map((j) => (
                <li key={j.id}><button className="btn btn-sm" onClick={() => openJob(j.id)}>{j.id.slice(0, 8)}…</button> <span className={`badge ${(j.status || "").toLowerCase()}`}>{j.status}</span></li>
              ))}
            </ul>
            {ocrJob && (
              <div className="ocr-box">
                <h4>Job {ocrJob.id.slice(0, 8)} — {ocrJob.status}</h4>
                {ocrJob.extractedText && <pre className="ocr-text">{ocrJob.extractedText.slice(0, 800)}</pre>}
                {ocrJob.extractedData && <pre className="ocr-text">{JSON.stringify(ocrJob.extractedData, null, 2).slice(0, 800)}</pre>}
                {ocrJob.status === "COMPLETED" && <button className="btn btn-primary" onClick={applyOcr}>Apply Extracted Data (Manual Entry)</button>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
