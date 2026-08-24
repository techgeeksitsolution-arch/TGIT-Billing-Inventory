import { useEffect, useState } from "react";

export default function PurchasePreview({ purchaseId, onBack, onEdit, onChanged }) {
  const [purchase, setPurchase] = useState(null);
  const [profile, setProfile] = useState(null);
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
    setAction("finalizing");
    const res = await fetch(`/api/v1/purchases/${purchaseId}/finalize`, { method: "POST" });
    if (res.ok) { await load(); onChanged && onChanged(); }
    setAction(null);
  };
  const doCancel = async () => {
    setAction("cancelling");
    const res = await fetch(`/api/v1/purchases/${purchaseId}/cancel`, { method: "POST" });
    if (res.ok) { await load(); onChanged && onChanged(); }
    setAction(null);
  };

  if (loading || !purchase) return <p>Loading…</p>;

  const fmt = (n) => Number(n).toFixed(2);
  const statusLabel = { DRAFT: "Draft", CONFIRMED: "Finalized", CANCELLED: "Cancelled" }[purchase.status] || purchase.status;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <button className="btn btn-sm" onClick={onBack}>← Back</button>
          <span className="doc-status" style={{ marginLeft: 12 }}>{statusLabel}</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-sm" onClick={() => window.print()}>Print</button>
          {purchase.status === "DRAFT" && <button className="btn btn-sm" onClick={() => onEdit && onEdit(purchase.id)}>Edit</button>}
          {purchase.status === "DRAFT" && <button className="btn btn-primary btn-sm" onClick={doFinalize} disabled={action}>Finalize</button>}
          {purchase.status === "CONFIRMED" && <button className="btn btn-danger btn-sm" onClick={doCancel} disabled={action}>Cancel</button>}
        </div>
      </div>

      <div className="invoice-preview" id="purchase-preview">
        <div className="invoice-header">
          <div>
            {profile?.logoBase64 && <img src={profile.logoBase64} alt="logo" className="invoice-logo" onError={(e) => { e.target.style.display = "none"; }} />}
            <div className="company-name">{profile?.name || "Company"}</div>
            {profile?.address && <div className="company-meta">{profile.address}</div>}
            {profile?.gstin && <div className="company-meta">GSTIN: {profile.gstin}</div>}
            {profile?.udyam && <div className="company-meta">UDYAM: {profile.udyam}</div>}
          </div>
          <div className="invoice-title">PURCHASE / BILL</div>
        </div>

        <div className="invoice-meta">
          <div><strong>Internal No:</strong> {purchase.internalNumber}</div>
          <div><strong>Supplier Invoice:</strong> {purchase.supplierInvoiceNo || "—"}</div>
          <div><strong>Date:</strong> {new Date(purchase.invoiceDate).toLocaleDateString()}</div>
          <div><strong>Tax Mode:</strong> {purchase.taxMode}</div>
        </div>

        {purchase.supplier && (
          <div className="party-box">
            <div className="party-label">Supplier</div>
            <div className="party-name">{purchase.supplier.name}</div>
            {purchase.supplier.gstNumber && <div>GSTIN: {purchase.supplier.gstNumber}</div>}
            {purchase.supplier.address && <div>{purchase.supplier.address}</div>}
            {purchase.supplier.mobile && <div>Phone: {purchase.supplier.mobile}</div>}
          </div>
        )}

        <table className="invoice-table">
          <thead>
            <tr><th>#</th><th>Item</th><th>HSN</th><th>Qty</th><th>Unit Price</th><th>Taxable</th><th>Tax</th><th>Total</th></tr>
          </thead>
          <tbody>
            {purchase.items.map((it, i) => (
              <tr key={it.id}>
                <td>{i + 1}</td>
                <td>{it.description}</td>
                <td>{it.hsnCode || "—"}</td>
                <td>{Number(it.quantity)}</td>
                <td>{fmt(it.unitPrice)}</td>
                <td>{fmt(it.taxableValue)}</td>
                <td>{fmt(Number(it.cgstAmount) + Number(it.sgstAmount) + Number(it.igstAmount))}</td>
                <td>{fmt(it.totalAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="invoice-totals">
          <div className="totals-row"><span>Taxable Total</span><span>{fmt(purchase.taxableTotal)}</span></div>
          {Number(purchase.cgstTotal) > 0 && <div className="totals-row"><span>CGST</span><span>{fmt(purchase.cgstTotal)}</span></div>}
          {Number(purchase.sgstTotal) > 0 && <div className="totals-row"><span>SGST</span><span>{fmt(purchase.sgstTotal)}</span></div>}
          {Number(purchase.igstTotal) > 0 && <div className="totals-row"><span>IGST</span><span>{fmt(purchase.igstTotal)}</span></div>}
          <div className="totals-row totals-grand"><span>Grand Total</span><span>{fmt(purchase.grandTotal)}</span></div>
        </div>

        <div className="invoice-footer" style={{ marginTop: 24 }}>
          <div>This is a computer-generated purchase record.</div>
          {profile?.invoiceFooter && <div>{profile.invoiceFooter}</div>}
        </div>
      </div>
    </div>
  );
}
