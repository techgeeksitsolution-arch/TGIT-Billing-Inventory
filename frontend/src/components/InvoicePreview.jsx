import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { apiPost } from "../api";
import { taxPercent, fmtPercent } from "../lib/invoiceTotals.js";
import { formatDate } from "../lib/format.js";
import { Letterhead, BankDetails } from "./Letterhead.jsx";
import StockOverrideModal from "./StockOverrideModal.jsx";

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
  const [stockWarnings, setStockWarnings] = useState(null);
  const [profile, setProfile] = useState({ name: "Tech Geeks IT Solution" });

  useEffect(() => {
    fetch(`/api/v1/sales/${id}`)
      .then(r => { if (!r.ok) throw new Error("Not found"); return r.json(); })
      .then(data => { setInvoice(data); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
    fetch("/api/v1/settings/company-profile").then(r => r.json()).then(setProfile).catch(() => {});
  }, [id]);

  const handleFinalize = async () => {
    if (!confirm("Finalize this invoice? Stock will be deducted.")) return;
    setFinalizing(true);
    setError(null);
    try {
      const result = await apiPost(`/sales/${id}/finalize`);
      setInvoice(result);
    } catch (e) {
      if (e.code === "INSUFFICIENT_STOCK" && e.details) {
        setStockWarnings(e.details);
      } else {
        setError(e.message);
      }
    } finally {
      setFinalizing(false);
    }
  };

  const handleOverrideConfirm = async (reason) => {
    setStockWarnings(null);
    setFinalizing(true);
    setError(null);
    try {
      const result = await apiPost(`/sales/${id}/finalize`, {
        stockOverride: true,
        overrideReason: reason,
        stockOverrideData: stockWarnings,
      });
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
          <Letterhead profile={profile} title="TAX INVOICE" status={inv.status} statusLabel={STATUS_LABELS[inv.status]} />

          {inv.stockOverride && (
            <div style={{ background: "#fff3cd", border: "1px solid #ffc107", borderRadius: 6, padding: "6px 12px", marginBottom: 12, fontSize: "0.82rem" }}>
              <strong>Stock Override:</strong> {inv.stockOverrideReason || "No reason specified"}
            </div>
          )}

          <div className="invoice-meta-grid">
            <div className="meta-group">
              <div className="meta-row"><span className="meta-label">Invoice No:</span><span className="meta-value mono">{inv.invoiceNumber}</span></div>
              <div className="meta-row"><span className="meta-label">Date:</span><span className="meta-value">{formatDate(inv.invoiceDate)}</span></div>
              <div className="meta-row"><span className="meta-label">Tax Mode:</span><span className="meta-value">{inv.taxMode.replace(/_/g, " ")}</span></div>
              {inv.placeOfSupply && <div className="meta-row"><span className="meta-label">Place of Supply:</span><span className="meta-value">{inv.placeOfSupply}</span></div>}
              {inv.workOrderNo && <div className="meta-row"><span className="meta-label">Work Order No.:</span><span className="meta-value">{inv.workOrderNo}</span></div>}
              {inv.quotationReference && <div className="meta-row"><span className="meta-label">Quotation Ref:</span><span className="meta-value mono">{inv.quotationReference}</span></div>}
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
                  <td className="r">{Number(item.quantity)} {item.uom ? item.uom : ""}</td>
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
                <div className="total-row"><span>CGST ({fmtPercent(taxPercent(Number(inv.cgstTotal), Number(inv.taxableTotal)))}%)</span><span>₹{Number(inv.cgstTotal).toFixed(2)}</span></div>
                <div className="total-row"><span>SGST ({fmtPercent(taxPercent(Number(inv.sgstTotal), Number(inv.taxableTotal)))}%)</span><span>₹{Number(inv.sgstTotal).toFixed(2)}</span></div>
              </>}
              {isGST && inv.taxMode === "INTER_STATE_GST" && (
                <div className="total-row"><span>IGST ({fmtPercent(taxPercent(Number(inv.igstTotal), Number(inv.taxableTotal)))}%)</span><span>₹{Number(inv.igstTotal).toFixed(2)}</span></div>
              )}
              <div className="total-row"><span>Total Tax</span><span>₹{Number(inv.totalTax).toFixed(2)}</span></div>
              <div className="total-row"><span>Discount</span><span>₹{Number(inv.discount || 0).toFixed(2)}</span></div>
              <div className="total-row"><span>Other Charges</span><span>₹{Number(inv.otherCharges || 0).toFixed(2)}</span></div>
              <div className="total-row"><span>Calculated Total</span><span>₹{(Number(inv.taxableTotal) + Number(inv.totalTax) + Number(inv.otherCharges || 0) - Number(inv.discount || 0)).toFixed(2)}</span></div>
              <div className="total-row"><span>Round Off</span><span>₹{Number(inv.roundOff || 0).toFixed(2)}</span></div>
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

      {stockWarnings && (
        <StockOverrideModal
          stockWarnings={stockWarnings}
          onConfirm={handleOverrideConfirm}
          onCancel={() => setStockWarnings(null)}
        />
      )}
    </div>
  );
}
