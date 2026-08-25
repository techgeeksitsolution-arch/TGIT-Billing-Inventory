import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiPost } from "../api";
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

const STATUS_LABELS = { DRAFT: "Draft", CONFIRMED: "Confirmed", CANCELLED: "Cancelled" };

export function QuotationPreview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [quotation, setQuotation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [finalizing, setFinalizing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState(null);
  const [profile, setProfile] = useState({ name: "Tech Geeks IT Solution" });
  const [terms, setTerms] = useState([]);
  const [converting, setConverting] = useState(false);
  const [showConvertForm, setShowConvertForm] = useState(false);
  const [convertDate, setConvertDate] = useState(new Date().toISOString().split("T")[0]);
  const [invoiceNumberMode, setInvoiceNumberMode] = useState("AUTO");
  const [manualNumber, setManualNumber] = useState("");

  useEffect(() => {
    fetch(`/api/v1/quotations/${id}`)
      .then(r => { if (!r.ok) throw new Error("Not found"); return r.json(); })
      .then(data => { setQuotation(data); setConvertDate(data.quotationDate ? String(data.quotationDate).slice(0, 10) : new Date().toISOString().split("T")[0]); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
    fetch("/api/v1/settings/company-profile").then(r => r.json()).then(setProfile).catch(() => {});
    fetch("/api/v1/settings/terms?type=QUOTATION").then(r => r.json()).then(d => setTerms(Array.isArray(d) ? d.filter(t => t.isEnabled) : [])).catch(() => setTerms([]));
  }, [id]);

  const handleFinalize = async () => {
    setFinalizing(true);
    setError(null);
    try {
      const result = await apiPost(`/quotations/${id}/finalize`);
      setQuotation(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setFinalizing(false);
    }
  };

  const handleConvert = async () => {
    setConverting(true);
    setError(null);
    try {
      const result = await apiPost(`/quotations/${id}/convert`, {
        invoiceDate: convertDate,
        invoiceNumberMode,
        invoiceNumber: invoiceNumberMode === "MANUAL" ? manualNumber : undefined,
      });
      navigate(`/sales/${result.salesInvoice.id}`);
    } catch (e) {
      const msg = e.message || "Conversion failed";
      setError(msg);
      setShowConvertForm(false);
    } finally {
      setConverting(false);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    setError(null);
    try {
      const result = await apiPost(`/quotations/${id}/cancel`);
      setQuotation(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setCancelling(false);
    }
  };

  if (loading) return <div className="loading">Loading...</div>;
  if (error && !quotation) return <div className="error-msg">{error}</div>;
  if (!quotation) return <div className="error-msg">Quotation not found</div>;

  const q = quotation;
  const isGST = q.taxMode === "INTRA_STATE_GST" || q.taxMode === "INTER_STATE_GST";
  const isExpired = new Date(q.validUntil) < new Date();

  return (
    <div className="page">
      <div className="page-header no-print">
        <h1>Quotation {q.quotationNumber}</h1>
        <div className="header-actions">
          {q.convertedInvoiceId ? (
            <button className="btn btn-primary" onClick={() => navigate(`/sales/${q.convertedInvoiceId}`)}>
              View Converted Invoice {q.convertedInvoiceNumber}
            </button>
          ) : (
            <>
              {q.status === "DRAFT" && (
                <button className="btn btn-primary" onClick={handleFinalize} disabled={finalizing}>
                  {finalizing ? "Confirming..." : "Confirm Quotation"}
                </button>
              )}
              {q.status === "CONFIRMED" && !showConvertForm && (
                <button className="btn btn-primary" onClick={() => setShowConvertForm(true)} disabled={converting}>
                  Convert to Sale Invoice
                </button>
              )}
              {q.status === "CONFIRMED" && showConvertForm && (
                <div className="no-print convert-box" style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, border: "1px solid #ddd", borderRadius: 6, marginRight: 8, background: "#fafafa" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <label>Invoice Date:</label>
                    <input type="date" value={convertDate} onChange={(e) => setConvertDate(e.target.value)} />
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <label>Invoice Number:</label>
                    <select value={invoiceNumberMode} onChange={(e) => setInvoiceNumberMode(e.target.value)}>
                      <option value="AUTO">Auto Generate</option>
                      <option value="MANUAL">Manual Number</option>
                    </select>
                  </div>
                  {invoiceNumberMode === "MANUAL" && (
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <label>Number:</label>
                      <input type="text" value={manualNumber} onChange={(e) => setManualNumber(e.target.value)} placeholder="e.g. TGIT/099/26-27" style={{ minWidth: 180 }} />
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn btn-primary" onClick={handleConvert} disabled={converting}>
                      {converting ? "Creating..." : "Create Sale Invoice"}
                    </button>
                    <button className="btn btn-outline" onClick={() => setShowConvertForm(false)} disabled={converting}>Cancel</button>
                  </div>
                </div>
              )}
              <button className="btn btn-outline" onClick={() => navigate(`/quotations/${id}/edit`)}>Edit</button>
            </>
          )}
          {q.status !== "CANCELLED" && (
            <button className="btn btn-danger" onClick={handleCancel} disabled={cancelling}>
              {cancelling ? "Cancelling..." : "Cancel"}
            </button>
          )}
          <button className="btn btn-outline" onClick={() => window.print()}>Print / PDF</button>
          <button className="btn btn-outline" onClick={() => navigate("/quotations")}>Back to List</button>
        </div>
      </div>

      {error && <div className="error-msg">{error}</div>}

      <div className="invoice-print-area" id="quotation-print">
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
              <h1 className="invoice-title">QUOTATION</h1>
              <span className="status-badge-inline" style={{ backgroundColor: q.status === "CONFIRMED" ? "#5cb85c" : q.status === "CANCELLED" ? "#d9534f" : "#f0ad4e" }}>
                {STATUS_LABELS[q.status]}
              </span>
            </div>
          </div>

          <div className="validity-banner">
            This quotation is valid for 1 Week from the date of issue.
          </div>

          <div className="invoice-meta-grid">
            <div className="meta-group">
              <div className="meta-row"><span className="meta-label">Quotation No:</span><span className="meta-value mono">{q.quotationNumber}</span></div>
              <div className="meta-row"><span className="meta-label">Date:</span><span className="meta-value">{new Date(q.quotationDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span></div>
              <div className="meta-row"><span className="meta-label">Valid Until:</span><span className="meta-value">{new Date(q.validUntil).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span></div>
              <div className="meta-row"><span className="meta-label">Tax Mode:</span><span className="meta-value">{q.taxMode.replace(/_/g, " ")}</span></div>
              {q.placeOfSupply && <div className="meta-row"><span className="meta-label">Place of Supply:</span><span className="meta-value">{q.placeOfSupply}</span></div>}
              {q.workOrderNo && <div className="meta-row"><span className="meta-label">Work Order No.:</span><span className="meta-value">{q.workOrderNo}</span></div>}
            </div>
            <div className="meta-group">
              <div className="meta-row"><span className="meta-label">To:</span><span className="meta-value">{q.customerName || "Walk-in Customer"}</span></div>
              {q.customerAddress && <div className="meta-row"><span className="meta-label">Address:</span><span className="meta-value">{q.customerAddress}</span></div>}
              {q.customerPhone && <div className="meta-row"><span className="meta-label">Phone:</span><span className="meta-value">{q.customerPhone}</span></div>}
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
                {isGST && q.taxMode === "INTRA_STATE_GST" && <>
                  <th className="r">CGST</th>
                  <th className="r">SGST</th>
                </>}
                {isGST && q.taxMode === "INTER_STATE_GST" && <th className="r">IGST</th>}
                <th className="r">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              {q.items?.map((item, idx) => (
                <tr key={item.id}>
                  <td>{idx + 1}</td>
                  <td>{item.description}</td>
                  <td className="mono">{item.hsnSac || "-"}</td>
                  <td className="r">{Number(item.quantity)}</td>
                  <td className="r">{Number(item.unitRate).toFixed(2)}</td>
                  <td className="r">{Number(item.taxableValue).toFixed(2)}</td>
                  {isGST && q.taxMode === "INTRA_STATE_GST" && <>
                    <td className="r">{Number(item.cgstAmount).toFixed(2)}<br/><small>{Number(item.cgstRate)}%</small></td>
                    <td className="r">{Number(item.sgstAmount).toFixed(2)}<br/><small>{Number(item.sgstRate)}%</small></td>
                  </>}
                  {isGST && q.taxMode === "INTER_STATE_GST" && (
                    <td className="r">{Number(item.igstAmount).toFixed(2)}<br/><small>{Number(item.igstRate)}%</small></td>
                  )}
                  <td className="r bold">{Number(item.totalAmount).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="invoice-footer-section">
            <div className="amount-words">
              <strong>Amount in Words:</strong> {numberToWords(Number(q.grandTotal))}
            </div>
            <div className="totals-summary">
              <div className="total-row"><span>Taxable Total</span><span>₹{Number(q.taxableTotal).toFixed(2)}</span></div>
              {isGST && q.taxMode === "INTRA_STATE_GST" && <>
                <div className="total-row"><span>CGST ({fmtPercent(taxPercent(Number(q.cgstTotal), Number(q.taxableTotal)))}%)</span><span>₹{Number(q.cgstTotal).toFixed(2)}</span></div>
                <div className="total-row"><span>SGST ({fmtPercent(taxPercent(Number(q.sgstTotal), Number(q.taxableTotal)))}%)</span><span>₹{Number(q.sgstTotal).toFixed(2)}</span></div>
              </>}
              {isGST && q.taxMode === "INTER_STATE_GST" && (
                <div className="total-row"><span>IGST ({fmtPercent(taxPercent(Number(q.igstTotal), Number(q.taxableTotal)))}%)</span><span>₹{Number(q.igstTotal).toFixed(2)}</span></div>
              )}
              <div className="total-row"><span>Total Tax</span><span>₹{Number(q.totalTax).toFixed(2)}</span></div>
              {Number(q.roundOff) !== 0 && <div className="total-row"><span>Round Off</span><span>₹{Number(q.roundOff).toFixed(2)}</span></div>}
              <div className="total-row grand"><span>Grand Total</span><span>₹{Number(q.grandTotal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></div>
            </div>
          </div>

          {q.notes && (
            <div className="quotation-notes">
              <strong>Notes:</strong> {q.notes}
            </div>
          )}

          <div className="invoice-bottom">
            <div className="terms-conditions">
              <h4>Terms & Conditions</h4>
              {terms.length === 0 ? (
                <ul>
                  <li>This quotation is valid for 1 Week from the date of issue.</li>
                  <li>Prices are inclusive/exclusive of applicable GST as mentioned.</li>
                  <li>Payment terms as per mutual agreement.</li>
                </ul>
              ) : (
                <ul>
                  {terms.map(t => <li key={t.id}>{t.text}</li>)}
                </ul>
              )}
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
