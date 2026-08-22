import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { apiPost } from "../api";

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

export function InvoicePreview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [finalizing, setFinalizing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState(null);
  const [orgName, setOrgName] = useState("Tech Geeks IT Solution");

  useEffect(() => {
    fetch(`/api/v1/sales/${id}`)
      .then(r => { if (!r.ok) throw new Error("Not found"); return r.json(); })
      .then(data => { setInvoice(data); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [id]);

  const handleFinalize = async () => {
    if (!confirm("Finalize this invoice? Stock will be deducted.")) return;
    setFinalizing(true);
    setError(null);
    try {
      const result = await apiPost(`/sales/${id}/finalize`);
      setInvoice(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setFinalizing(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm("Cancel this finalized invoice? Stock will be reversed.")) return;
    setCancelling(true);
    setError(null);
    try {
      const result = await apiPost(`/sales/${id}/cancel`);
      setInvoice(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setCancelling(false);
    }
  };

  if (loading) return <div className="loading">Loading...</div>;
  if (error && !invoice) return <div className="error-msg">{error}</div>;
  if (!invoice) return <div className="error-msg">Invoice not found</div>;

  const inv = invoice;
  const isGST = inv.taxMode === "INTRA_STATE_GST" || inv.taxMode === "INTER_STATE_GST";

  return (
    <div className="page">
      <div className="page-header no-print">
        <h1>Invoice {inv.invoiceNumber}</h1>
        <div className="header-actions">
          {inv.status === "DRAFT" && (
            <>
              <button className="btn btn-primary" onClick={handleFinalize} disabled={finalizing}>
                {finalizing ? "Finalizing..." : "Finalize & Deduct Stock"}
              </button>
              <button className="btn btn-outline" onClick={() => navigate(`/sales/${id}/edit`)}>Edit</button>
            </>
          )}
          {inv.status === "CONFIRMED" && (
            <button className="btn btn-danger" onClick={handleCancel} disabled={cancelling}>
              {cancelling ? "Cancelling..." : "Cancel Invoice"}
            </button>
          )}
          <button className="btn btn-outline" onClick={() => window.print()}>Print / PDF</button>
          <button className="btn btn-outline" onClick={() => navigate("/sales")}>Back to List</button>
        </div>
      </div>

      {error && <div className="error-msg">{error}</div>}

      <div className="invoice-print-area" id="invoice-print">
        <div className="invoice-paper">
          <div className="invoice-header-section">
            <div className="invoice-brand">
              <img src="/TGIT.png" alt="TGIT" className="invoice-logo" onError={(e) => { e.target.style.display = "none"; }} />
              <div>
                <h2 className="org-name">{orgName}</h2>
                <p className="org-tagline">Tech Geeks IT Solution</p>
              </div>
            </div>
            <div className="invoice-title-block">
              <h1 className="invoice-title">TAX INVOICE</h1>
              <span className="status-badge-inline" style={{ backgroundColor: inv.status === "CONFIRMED" ? "#5cb85c" : inv.status === "CANCELLED" ? "#d9534f" : "#f0ad4e" }}>
                {STATUS_LABELS[inv.status]}
              </span>
            </div>
          </div>

          <div className="invoice-meta-grid">
            <div className="meta-group">
              <div className="meta-row"><span className="meta-label">Invoice No:</span><span className="meta-value mono">{inv.invoiceNumber}</span></div>
              <div className="meta-row"><span className="meta-label">Date:</span><span className="meta-value">{new Date(inv.invoiceDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span></div>
              <div className="meta-row"><span className="meta-label">Tax Mode:</span><span className="meta-value">{inv.taxMode.replace(/_/g, " ")}</span></div>
              {inv.placeOfSupply && <div className="meta-row"><span className="meta-label">Place of Supply:</span><span className="meta-value">{inv.placeOfSupply}</span></div>}
            </div>
            <div className="meta-group">
              <div className="meta-row"><span className="meta-label">Bill To:</span><span className="meta-value">{inv.customer?.name || "Walk-in Customer"}</span></div>
              {inv.customer?.address && <div className="meta-row"><span className="meta-label">Address:</span><span className="meta-value">{inv.customer.address}</span></div>}
              {inv.customer?.phone && <div className="meta-row"><span className="meta-label">Phone:</span><span className="meta-value">{inv.customer.phone}</span></div>}
              {inv.customer?.gstNumber && <div className="meta-row"><span className="meta-label">GSTIN:</span><span className="meta-value mono">{inv.customer.gstNumber}</span></div>}
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
                  <td className="mono">{item.hsnSac || "-"}</td>
                  <td className="r">{Number(item.quantity)}</td>
                  <td className="r">{Number(item.unitRate).toFixed(2)}</td>
                  <td className="r">{Number(item.taxableValue).toFixed(2)}</td>
                  {isGST && inv.taxMode === "INTRA_STATE_GST" && <>
                    <td className="r">{Number(item.cgstAmount).toFixed(2)}<br/><small>{Number(item.cgstRate)}%</small></td>
                    <td className="r">{Number(item.sgstAmount).toFixed(2)}<br/><small>{Number(item.sgstRate)}%</small></td>
                  </>}
                  {isGST && inv.taxMode === "INTER_STATE_GST" && (
                    <td className="r">{Number(item.igstAmount).toFixed(2)}<br/><small>{Number(item.igstRate)}%</small></td>
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
                <div className="total-row"><span>CGST</span><span>₹{Number(inv.cgstTotal).toFixed(2)}</span></div>
                <div className="total-row"><span>SGST</span><span>₹{Number(inv.sgstTotal).toFixed(2)}</span></div>
              </>}
              {isGST && inv.taxMode === "INTER_STATE_GST" && (
                <div className="total-row"><span>IGST</span><span>₹{Number(inv.igstTotal).toFixed(2)}</span></div>
              )}
              <div className="total-row"><span>Total Tax</span><span>₹{Number(inv.totalTax).toFixed(2)}</span></div>
              {Number(inv.roundOff) !== 0 && <div className="total-row"><span>Round Off</span><span>₹{Number(inv.roundOff).toFixed(2)}</span></div>}
              <div className="total-row grand"><span>Grand Total</span><span>₹{Number(inv.grandTotal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></div>
            </div>
          </div>

          <div className="invoice-bottom">
            <div className="bank-details">
              <h4>Bank Details</h4>
              <p>Bank: [Your Bank Name]<br/>A/C No: [Your Account Number]<br/>IFSC: [Your IFSC Code]<br/>Branch: [Your Branch]</p>
            </div>
            <div className="authorized-signatory">
              <p>For {orgName}</p>
              <div className="signature-line"></div>
              <p>Authorized Signatory</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
