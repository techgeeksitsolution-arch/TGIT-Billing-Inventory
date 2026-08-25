import { useState, useEffect } from "react";
import { taxPercent, fmtPercent } from "../lib/invoiceTotals.js";

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

  const load = async () => {
    setLoading(true);
    const p = await fetch(`/api/v1/purchases/${purchaseId}`).then((r) => r.json());
    const pr = await fetch("/api/v1/settings/company-profile").then((r) => r.json());
    setPurchase(p); setProfile(pr); setLoading(false);
  };
  useEffect(() => { load(); }, [purchaseId]);

  const doFinalize = async () => {
    if (!confirm("Finalize this purchase? Stock will be added.")) return;
    setAction("finalizing");
    const res = await fetch(`/api/v1/purchases/${purchaseId}/finalize`, { method: "POST" });
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

  if (loading || !purchase) return <div className="loading">Loading…</div>;

  const inv = purchase;
  const isGST = inv.taxMode === "INTRA_STATE_GST" || inv.taxMode === "INTER_STATE_GST";

  return (
    <div className="page">
      <div className="page-header no-print">
        <h1>Purchase {inv.internalNumber}</h1>
        <div className="header-actions">
          {inv.status === "DRAFT" && (
            <>
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
          <div className="invoice-header-section">
            <div className="invoice-brand">
              <img src={profile.logoBase64 || "/TGIT.png"} alt="TGIT" className="invoice-logo" onError={(e) => { e.target.style.display = "none"; }} />
              <div>
                <h2 className="org-name">{profile.name}</h2>
                <p className="org-tagline">Tech Geeks IT Solution</p>
              </div>
            </div>
            <div className="invoice-title-block">
              <h1 className="invoice-title">PURCHASE INVOICE</h1>
              <span className="status-badge-inline" style={{ backgroundColor: inv.status === "CONFIRMED" ? "#5cb85c" : inv.status === "CANCELLED" ? "#d9534f" : "#f0ad4e" }}>
                {STATUS_LABELS[inv.status]}
              </span>
            </div>
          </div>

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
              {inv.supplier?.address && <div className="meta-row"><span className="meta-label">Address:</span><span className="meta-value">{inv.supplier.address}</span></div>}
              {inv.supplier?.phone && <div className="meta-row"><span className="meta-label">Phone:</span><span className="meta-value">{inv.supplier.phone}</span></div>}
              {inv.supplier?.gstNumber && <div className="meta-row"><span className="meta-label">GSTIN:</span><span className="meta-value mono">{inv.supplier.gstNumber}</span></div>}
            </div>
          </div>

          <table className="invoice-items-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Description</th>
                <th>HSN/SAC</th>
                <th className="r">Qty</th>
                <th className="r">Rate (₹)</th>
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
                  <td className="r">{Number(item.quantity)}</td>
                  <td className="r">{Number(item.unitPrice).toFixed(2)}</td>
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
              {isGST && inv.taxMode === "INTRA_STATE_GST" && <>
                <div className="total-row"><span>CGST ({fmtPercent(taxPercent(Number(inv.cgstTotal), Number(inv.taxableTotal)))}%)</span><span>₹{Number(inv.cgstTotal).toFixed(2)}</span></div>
                <div className="total-row"><span>SGST ({fmtPercent(taxPercent(Number(inv.sgstTotal), Number(inv.taxableTotal)))}%)</span><span>₹{Number(inv.sgstTotal).toFixed(2)}</span></div>
              </>}
              {isGST && inv.taxMode === "INTER_STATE_GST" && (
                <div className="total-row"><span>IGST ({fmtPercent(taxPercent(Number(inv.igstTotal), Number(inv.taxableTotal)))}%)</span><span>₹{Number(inv.igstTotal).toFixed(2)}</span></div>
              )}
              <div className="total-row"><span>Total Tax</span><span>₹{Number(inv.totalTax).toFixed(2)}</span></div>
              {Number(inv.roundOff) !== 0 && <div className="total-row"><span>Round Off</span><span>₹{Number(inv.roundOff).toFixed(2)}</span></div>}
              <div className="total-row grand"><span>Grand Total</span><span>₹{Number(inv.grandTotal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></div>
            </div>
          </div>

          <div className="invoice-bottom">
            <div className="bank-details">
              <h4>Bank Details</h4>
              <p>Bank: [Your Bank Name]<br />A/C No: [Your Account Number]<br />IFSC: [Your IFSC Code]<br />Branch: [Your Branch]</p>
            </div>
            <div className="authorized-signatory">
              <p>For {profile.name}</p>
              <div className="signature-line"></div>
              <p>Authorized Signatory</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
