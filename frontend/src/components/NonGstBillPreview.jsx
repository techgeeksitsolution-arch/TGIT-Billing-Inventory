import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
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

export function NonGstBillPreview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [bill, setBill] = useState(null);
  const [loading, setLoading] = useState(true);
  const [finalizing, setFinalizing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState(null);
  const [profile, setProfile] = useState({ name: "Tech Geeks IT Solution" });

  useEffect(() => {
    fetch(`/api/v1/nongst/${id}`)
      .then(r => { if (!r.ok) throw new Error("Not found"); return r.json(); })
      .then(data => { setBill(data); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
    fetch("/api/v1/settings/company-profile").then(r => r.json()).then(setProfile).catch(() => {});
  }, [id]);

  const handleFinalize = async () => {
    if (!confirm("Finalize this bill?")) return;
    setFinalizing(true);
    setError(null);
    try {
      const result = await apiPost(`/nongst/${id}/finalize`);
      setBill(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setFinalizing(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm("Cancel this bill?")) return;
    setCancelling(true);
    setError(null);
    try {
      const result = await apiPost(`/nongst/${id}/cancel`);
      setBill(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setCancelling(false);
    }
  };

  if (loading) return <div className="loading">Loading...</div>;
  if (error && !bill) return <div className="error-msg">{error}</div>;
  if (!bill) return <div className="error-msg">Bill not found</div>;

  const b = bill;
  const calculatedTotal = Number(b.taxableTotal) + Number(b.otherCharges || 0) - Number(b.discount || 0);

  return (
    <div className="page">
      <div className="page-header no-print">
        <h1>Non-GST Bill {b.billNumber}</h1>
        <div className="header-actions">
          {b.status === "DRAFT" && (
            <>
              <button className="btn btn-primary" onClick={handleFinalize} disabled={finalizing}>
                {finalizing ? "Finalizing..." : "Finalize Bill"}
              </button>
              <button className="btn btn-outline" onClick={() => navigate(`/nongst/${id}/edit`)}>Edit</button>
            </>
          )}
          {b.status === "CONFIRMED" && (
            <button className="btn btn-danger" onClick={handleCancel} disabled={cancelling}>
              {cancelling ? "Cancelling..." : "Cancel Bill"}
            </button>
          )}
          <button className="btn btn-outline" onClick={() => window.print()}>Print / PDF</button>
          <button className="btn btn-outline" onClick={() => navigate("/nongst")}>Back to List</button>
        </div>
      </div>

      {error && <div className="error-msg">{error}</div>}

      <div className="invoice-print-area" id="bill-print">
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
              <h1 className="invoice-title">BILL</h1>
              <span className="status-badge-inline" style={{ backgroundColor: b.status === "CONFIRMED" ? "#5cb85c" : b.status === "CANCELLED" ? "#d9534f" : "#f0ad4e" }}>
                {STATUS_LABELS[b.status]}
              </span>
            </div>
          </div>

          <div className="invoice-meta-grid">
            <div className="meta-group">
              <div className="meta-row"><span className="meta-label">Bill No:</span><span className="meta-value mono">{b.billNumber}</span></div>
              <div className="meta-row"><span className="meta-label">Date:</span><span className="meta-value">{new Date(b.billDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span></div>
            </div>
            <div className="meta-group">
              <div className="meta-row"><span className="meta-label">To:</span><span className="meta-value">{b.customerName || "Walk-in Customer"}</span></div>
              {b.customerPhone && <div className="meta-row"><span className="meta-label">Phone:</span><span className="meta-value">{b.customerPhone}</span></div>}
              {b.customerAddress && <div className="meta-row"><span className="meta-label">Address:</span><span className="meta-value">{b.customerAddress}</span></div>}
            </div>
          </div>

          <table className="invoice-items-table">
            <thead>
              <tr>
                <th>Sl No</th>
                <th>Item Description</th>
                <th className="r">Price (₹)</th>
                <th className="r">Qty</th>
                <th className="r">Total Price (₹)</th>
              </tr>
            </thead>
            <tbody>
              {b.items?.map((item, idx) => (
                <tr key={item.id}>
                  <td>{idx + 1}</td>
                  <td>{item.description}</td>
                  <td className="r">{Number(item.price).toFixed(2)}</td>
                  <td className="r">{Number(item.quantity)}</td>
                  <td className="r bold">{Number(item.totalPrice).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="invoice-footer-section">
            <div className="amount-words">
              <strong>Amount in Words:</strong> {numberToWords(Number(b.grandTotal))}
            </div>
            <div className="totals-summary">
              <div className="total-row"><span>Taxable Total</span><span>₹{Number(b.taxableTotal).toFixed(2)}</span></div>
              <div className="total-row"><span>Discount</span><span>₹{Number(b.discount || 0).toFixed(2)}</span></div>
              <div className="total-row"><span>Other Charges</span><span>₹{Number(b.otherCharges || 0).toFixed(2)}</span></div>
              <div className="total-row"><span>Calculated Total</span><span>₹{calculatedTotal.toFixed(2)}</span></div>
              <div className="total-row"><span>Round Off</span><span>₹{Number(b.roundOff || 0).toFixed(2)}</span></div>
              <div className="total-row grand"><span>Grand Total</span><span>₹{Number(b.grandTotal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></div>
            </div>
          </div>

          <div className="invoice-bottom">
            <div className="bill-notes">
              {b.paymentMode && <p><strong>Payment Mode:</strong> {b.paymentMode}</p>}
              {b.notes && <p><strong>Notes:</strong> {b.notes}</p>}
              <p className="terms-note">Subject to our standard terms & conditions. Goods once sold will not be taken back.</p>
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
