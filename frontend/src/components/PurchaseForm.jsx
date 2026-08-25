import { useEffect, useState } from "react";
import { taxPercent, fmtPercent } from "../lib/invoiceTotals.js";

const roundTo2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function computeItem(item, taxMode, taxRatePercent) {
  const quantity = Number(item.quantity) || 0;
  const unitPrice = Number(item.unitPrice) || 0;
  const taxableValue = roundTo2(quantity * unitPrice);
  let cgstRate = 0, cgstAmount = 0, sgstRate = 0, sgstAmount = 0, igstRate = 0, igstAmount = 0;
  if (taxMode === "INTRA_STATE_GST") {
    cgstRate = taxRatePercent / 2; sgstRate = taxRatePercent / 2;
    cgstAmount = roundTo2((taxableValue * taxRatePercent) / 200);
    sgstAmount = cgstAmount;
  } else if (taxMode === "INTER_STATE_GST") {
    igstRate = taxRatePercent;
    igstAmount = roundTo2((taxableValue * taxRatePercent) / 100);
  }
  const totalAmount = roundTo2(taxableValue + cgstAmount + sgstAmount + igstAmount);
  return { taxableValue, cgstRate, cgstAmount, sgstRate, sgstAmount, igstRate, igstAmount, totalAmount };
}

export default function PurchaseForm({ purchaseId, onSaved }) {
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [taxRates, setTaxRates] = useState([]);
  const [supplierId, setSupplierId] = useState("");
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [taxMode, setTaxMode] = useState("NON_GST");
  const [items, setItems] = useState([{ productId: "", description: "", hsnCode: "", quantity: 1, unitPrice: 0, taxRatePercent: 0 }]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch("/api/v1/suppliers").then((r) => r.json()).then(setSuppliers);
    fetch("/api/v1/products").then((r) => r.json()).then(setProducts);
    fetch("/api/v1/tax-rates").then((r) => r.json()).then(setTaxRates).catch(() => {});
  }, []);

  useEffect(() => {
    if (!purchaseId) return;
    setLoading(true);
    fetch(`/api/v1/purchases/${purchaseId}`).then((r) => r.json()).then((p) => {
      setSupplierId(p.supplierId || "");
      setSupplierInvoiceNo(p.supplierInvoiceNo || "");
      setInvoiceDate(p.invoiceDate ? p.invoiceDate.slice(0, 10) : invoiceDate);
      setTaxMode(p.taxMode || "NON_GST");
      setItems(p.items.map((it) => ({ productId: it.productId || "", description: it.description, hsnCode: it.hsnCode || "", quantity: Number(it.quantity), unitPrice: Number(it.unitPrice), taxRatePercent: Number(it.cgstRate) * 2 || Number(it.igstRate) || 0 })));
      setLoading(false);
    });
  }, [purchaseId]);

  const selectProduct = async (idx, productId) => {
    const updated = [...items];
    updated[idx].productId = productId;
    if (productId) {
      const res = await fetch(`/api/v1/products/${productId}`);
      const prod = await res.json();
      updated[idx].description = prod.name;
      updated[idx].hsnCode = prod.hsnCode || "";
      updated[idx].taxRatePercent = prod.taxRate ? Number(prod.taxRate.rate) : 0;
    }
    setItems(updated);
  };

  const updateItem = (idx, field, value) => {
    const updated = [...items];
    updated[idx][field] = value;
    setItems(updated);
  };
  const addItem = () => setItems([...items, { productId: "", description: "", hsnCode: "", quantity: 1, unitPrice: 0, taxRatePercent: 0 }]);
  const removeItem = (idx) => setItems(items.filter((_, i) => i !== idx));

  const computed = items.map((it) => computeItem(it, taxMode, it.taxRatePercent));
  const taxableTotal = roundTo2(computed.reduce((s, c) => s + c.taxableValue, 0));
  const cgstTotal = roundTo2(computed.reduce((s, c) => s + c.cgstAmount, 0));
  const sgstTotal = roundTo2(computed.reduce((s, c) => s + c.sgstAmount, 0));
  const igstTotal = roundTo2(computed.reduce((s, c) => s + c.igstAmount, 0));
  const grandTotal = roundTo2(taxableTotal + cgstTotal + sgstTotal + igstTotal);

  const save = async () => {
    setSaving(true); setError(null);
    const payload = {
      supplierId, supplierInvoiceNo, invoiceDate, taxMode,
      items: items.map((it) => ({ productId: it.productId || null, description: it.description, hsnCode: it.hsnCode, quantity: Number(it.quantity), unitPrice: Number(it.unitPrice), taxRate: it.taxRatePercent ? Number(it.taxRatePercent) : undefined })),
    };
    try {
      const method = purchaseId ? "PUT" : "POST";
      const url = purchaseId ? `/api/v1/purchases/${purchaseId}` : "/api/v1/purchases";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Save failed");
      onSaved && onSaved(data.id);
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  if (loading) return <p>Loading…</p>;

  return (
    <div className="page">
      <div className="page-header"><h1>{purchaseId ? "Edit Purchase" : "New Purchase"}</h1></div>
      <div className="form-card">
        <div className="form-row">
          <div className="form-group"><label>Supplier *</label>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Select supplier</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Supplier Invoice No</label><input value={supplierInvoiceNo} onChange={(e) => setSupplierInvoiceNo(e.target.value)} /></div>
          <div className="form-group"><label>Date</label><input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} /></div>
          <div className="form-group"><label>Tax Mode</label>
            <select value={taxMode} onChange={(e) => setTaxMode(e.target.value)}>
              <option value="NON_GST">Non-GST</option>
              <option value="INTRA_STATE_GST">Intra-State GST (CGST + SGST)</option>
              <option value="INTER_STATE_GST">Inter-State GST (IGST)</option>
              <option value="EXEMPT">Exempt</option>
            </select>
          </div>
        </div>
      </div>

      <div className="form-card">
        <h3>Items</h3>
        <table className="data-table">
          <thead>
            <tr><th style={{ width: 200 }}>Product</th><th>Description</th><th>HSN</th><th>Qty</th><th>Unit Price</th><th>Tax %</th><th>Total</th><th></th></tr>
          </thead>
          <tbody>
            {items.map((it, idx) => (
              <tr key={idx}>
                <td><select value={it.productId} onChange={(e) => selectProduct(idx, e.target.value)}><option value="">—</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></td>
                <td><input value={it.description} onChange={(e) => updateItem(idx, "description", e.target.value)} /></td>
                <td><input style={{ width: 90 }} value={it.hsnCode} onChange={(e) => updateItem(idx, "hsnCode", e.target.value)} /></td>
                <td><input style={{ width: 70 }} type="number" value={it.quantity} onChange={(e) => updateItem(idx, "quantity", e.target.value)} /></td>
                <td><input style={{ width: 100 }} type="number" value={it.unitPrice} onChange={(e) => updateItem(idx, "unitPrice", e.target.value)} /></td>
                 <td>
                   <select style={{ width: 80 }} value={it.taxRatePercent ? String(it.taxRatePercent) : ""} onChange={(e) => updateItem(idx, "taxRatePercent", e.target.value === "" ? 0 : Number(e.target.value))}>
                     <option value="">Auto</option>
                     {taxRates.map((t) => <option key={t.id} value={String(t.rate)}>{t.rate}%</option>)}
                   </select>
                 </td>
                <td>{computed[idx].totalAmount.toFixed(2)}</td>
                <td><button className="btn btn-sm" onClick={() => removeItem(idx)} disabled={items.length === 1}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn btn-sm" onClick={addItem}>+ Add Item</button>
      </div>

      <div className="form-card" style={{ maxWidth: 360 }}>
        <div className="totals-row"><span>Taxable</span><span>{taxableTotal.toFixed(2)}</span></div>
        {taxMode === "INTRA_STATE_GST" && <>
          <div className="totals-row"><span>CGST ({fmtPercent(taxPercent(cgstTotal, taxableTotal))}%)</span><span>{cgstTotal.toFixed(2)}</span></div>
          <div className="totals-row"><span>SGST ({fmtPercent(taxPercent(sgstTotal, taxableTotal))}%)</span><span>{sgstTotal.toFixed(2)}</span></div>
        </>}
        {taxMode === "INTER_STATE_GST" && <div className="totals-row"><span>IGST ({fmtPercent(taxPercent(igstTotal, taxableTotal))}%)</span><span>{igstTotal.toFixed(2)}</span></div>}
        <div className="totals-row totals-grand"><span>Grand Total</span><span>{grandTotal.toFixed(2)}</span></div>
      </div>

      {error && <p className="error-msg">{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary" onClick={save} disabled={saving || !supplierId}>Save as Draft</button>
        <button className="btn" onClick={() => onSaved && onSaved(null)}>Cancel</button>
      </div>
    </div>
  );
}
