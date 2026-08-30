import { useEffect, useState } from "react";
import { taxPercent, fmtPercent } from "../lib/invoiceTotals.js";
import QuickAddSupplier from "./QuickAddSupplier.jsx";

const roundTo2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function computeItem(item, taxMode, taxRatePercent) {
  const quantity = Number(item.quantity) || 0;
  const unitPrice = Number(item.unitPrice) || 0;
  const discount = Number(item.discount) || 0;
  const taxableValue = roundTo2(quantity * unitPrice - discount);
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

const emptyItem = () => ({ productId: "", description: "", hsnCode: "", quantity: 1, unitPrice: 0, discount: 0, uom: "Nos", taxRatePercent: 0 });
const emptyPayment = () => ({ amount: 0, mode: "Cash", date: new Date().toISOString().slice(0, 10), reference: "", note: "" });

export default function PurchaseForm({ purchaseId, onSaved }) {
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [taxRates, setTaxRates] = useState([]);
  const [supplierId, setSupplierId] = useState("");
  const [supplierInfo, setSupplierInfo] = useState(null);
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState("");
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [taxMode, setTaxMode] = useState("NON_GST");
  const [placeOfSupply, setPlaceOfSupply] = useState("");
  const [roundOffMode, setRoundOffMode] = useState("NEAREST");
  const [reverseCharge, setReverseCharge] = useState(false);
  const [paymentMode, setPaymentMode] = useState("");
  const [poNo, setPoNo] = useState("");
  const [poDate, setPoDate] = useState("");
  const [challanNo, setChallanNo] = useState("");
  const [challanDate, setChallanDate] = useState("");
  const [lrNo, setLrNo] = useState("");
  const [ewayBillNo, setEwayBillNo] = useState("");
  const [deliveryMode, setDeliveryMode] = useState("");
  const [otherCharges, setOtherCharges] = useState(0);
  const [items, setItems] = useState([emptyItem()]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch("/api/v1/suppliers?includeInactive=1").then((r) => r.json()).then(setSuppliers);
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
      setPlaceOfSupply(p.placeOfSupply || "");
      setRoundOffMode(p.roundOffMode || "NEAREST");
      setReverseCharge(Boolean(p.reverseCharge));
      setPaymentMode(p.paymentMode || "");
      setPoNo(p.poNo || "");
      setPoDate(p.poDate ? p.poDate.slice(0, 10) : "");
      setChallanNo(p.challanNo || "");
      setChallanDate(p.challanDate ? p.challanDate.slice(0, 10) : "");
      setLrNo(p.lrNo || "");
      setEwayBillNo(p.ewayBillNo || "");
      setDeliveryMode(p.deliveryMode || "");
      setOtherCharges(Number(p.otherCharges) || 0);
      setItems(p.items.length ? p.items.map((it) => ({
        productId: it.productId || "", description: it.description, hsnCode: it.hsnCode || "",
        quantity: Number(it.quantity), unitPrice: Number(it.unitPrice), discount: Number(it.discount) || 0, uom: it.uom || "Nos",
        taxRatePercent: Number(it.cgstRate) * 2 || Number(it.igstRate) || 0,
      })) : [emptyItem()]);
      setLoading(false);
    });
  }, [purchaseId]);

  useEffect(() => {
    if (!supplierId) { setSupplierInfo(null); return; }
    fetch(`/api/v1/suppliers/${supplierId}`).then((r) => r.json()).then(setSupplierInfo).catch(() => {});
  }, [supplierId]);

  const selectProduct = async (idx, productId) => {
    const updated = [...items];
    updated[idx].productId = productId;
    if (productId) {
      const res = await fetch(`/api/v1/products/${productId}`);
      const prod = await res.json();
      updated[idx].description = prod.name;
      updated[idx].hsnCode = prod.hsnCode || "";
      updated[idx].taxRatePercent = prod.taxRate ? Number(prod.taxRate.rate) : 0;
      updated[idx].uom = prod.unit?.name || "Nos";
    }
    setItems(updated);
  };

  const updateItem = (idx, field, value) => {
    const updated = [...items];
    updated[idx][field] = value;
    setItems(updated);
  };
  const addItem = () => setItems([...items, emptyItem()]);
  const removeItem = (idx) => setItems(items.filter((_, i) => i !== idx));

  const updatePayment = (idx, field, value) => {
    const updated = [...payments];
    updated[idx][field] = value;
    setPayments(updated);
  };
  const addPayment = () => setPayments([...payments, emptyPayment()]);
  const removePayment = (idx) => setPayments(payments.filter((_, i) => i !== idx));

  const computed = items.map((it) => computeItem(it, taxMode, it.taxRatePercent));
  const taxableTotal = roundTo2(computed.reduce((s, c) => s + c.taxableValue, 0));
  const lineDiscountTotal = roundTo2(items.reduce((s, it) => s + (Number(it.discount) || 0) * (Number(it.quantity) || 1), 0));
  const cgstTotal = roundTo2(computed.reduce((s, c) => s + c.cgstAmount, 0));
  const sgstTotal = roundTo2(computed.reduce((s, c) => s + c.sgstAmount, 0));
  const igstTotal = roundTo2(computed.reduce((s, c) => s + c.igstAmount, 0));
  const other = Number(otherCharges) || 0;
  const grandTotal = roundTo2(taxableTotal + cgstTotal + sgstTotal + igstTotal + other);

  const save = async () => {
    setSaving(true); setError(null);
    const payload = {
      supplierId, supplierInvoiceNo, invoiceDate, taxMode, placeOfSupply: placeOfSupply || null,
      roundOffMode, reverseCharge, paymentMode: paymentMode || null,
      poNo: poNo || null, poDate: poDate || null, challanNo: challanNo || null, challanDate: challanDate || null,
      lrNo: lrNo || null, ewayBillNo: ewayBillNo || null, deliveryMode: deliveryMode || null,
      otherCharges: other,
      items: items.map((it) => ({
        productId: it.productId || null, description: it.description, hsnCode: it.hsnCode,
        quantity: Number(it.quantity), unitPrice: Number(it.unitPrice),
        discount: Number(it.discount) || 0, uom: it.uom || "Nos",
        taxRate: it.taxRatePercent ? Number(it.taxRatePercent) : undefined,
      })),
    };
    if (!purchaseId && payments.length) payload.payments = payments.map((p) => ({ amount: Number(p.amount), mode: p.mode, date: p.date, reference: p.reference || null, note: p.note || null }));
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
            <div className="inline-quick-add">
              <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">Select supplier</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}{s.isActive === false ? " (inactive)" : ""}</option>)}
              </select>
              <button type="button" className="btn btn-sm btn-outline" onClick={() => setShowQuickAdd(true)}>+ Add New Supplier</button>
            </div>
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
          <div className="form-group"><label>Place of Supply</label><input value={placeOfSupply} onChange={(e) => setPlaceOfSupply(e.target.value)} placeholder="e.g. Karnataka" /></div>
        </div>
        {supplierInfo && (
          <div className="supplier-info-box">
            {supplierInfo.contactPerson && <span><strong>Contact:</strong> {supplierInfo.contactPerson}</span>}
            {supplierInfo.gstNumber && <span><strong>GSTIN:</strong> {supplierInfo.gstNumber}</span>}
            {supplierInfo.address && <span><strong>Address:</strong> {supplierInfo.address}</span>}
          </div>
        )}
      </div>

      <div className="form-card">
        <h3>Reference Details</h3>
        <div className="form-row">
          <div className="form-group"><label>PO No</label><input value={poNo} onChange={(e) => setPoNo(e.target.value)} /></div>
          <div className="form-group"><label>PO Date</label><input type="date" value={poDate} onChange={(e) => setPoDate(e.target.value)} /></div>
          <div className="form-group"><label>Challan No</label><input value={challanNo} onChange={(e) => setChallanNo(e.target.value)} /></div>
          <div className="form-group"><label>Challan Date</label><input type="date" value={challanDate} onChange={(e) => setChallanDate(e.target.value)} /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label>LR No</label><input value={lrNo} onChange={(e) => setLrNo(e.target.value)} /></div>
          <div className="form-group"><label>E-Way Bill No</label><input value={ewayBillNo} onChange={(e) => setEwayBillNo(e.target.value)} /></div>
          <div className="form-group"><label>Delivery Mode</label><input value={deliveryMode} onChange={(e) => setDeliveryMode(e.target.value)} placeholder="e.g. Road, Courier" /></div>
          <div className="form-group"><label>Payment Mode</label>
            <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
              <option value="">—</option>
              <option>Cash</option><option>Bank</option><option>UPI</option><option>Cheque</option><option>Credit</option>
            </select>
          </div>
        </div>
      </div>

      <div className="form-card">
        <h3>Items</h3>
        <div style={{ overflowX: "auto" }}>
        <table className="data-table">
          <thead>
            <tr><th>Product</th><th>Description</th><th>HSN</th><th>UOM</th><th>Qty</th><th>Unit Price</th><th>DISC (%)</th><th>Tax %</th><th>Total</th><th></th></tr>
          </thead>
          <tbody>
            {items.map((it, idx) => (
              <tr key={idx}>
                <td><select value={it.productId} onChange={(e) => selectProduct(idx, e.target.value)}><option value="">—</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></td>
                <td><input value={it.description} onChange={(e) => updateItem(idx, "description", e.target.value)} /></td>
                <td><input value={it.hsnCode} onChange={(e) => updateItem(idx, "hsnCode", e.target.value)} /></td>
                <td><input value={it.uom} onChange={(e) => updateItem(idx, "uom", e.target.value)} /></td>
                <td><input type="number" value={it.quantity} onChange={(e) => updateItem(idx, "quantity", e.target.value)} /></td>
                <td><input type="number" value={it.unitPrice} onChange={(e) => updateItem(idx, "unitPrice", e.target.value)} /></td>
                <td><input type="number" value={it.discount} onChange={(e) => updateItem(idx, "discount", e.target.value)} /></td>
                <td>
                  <select value={it.taxRatePercent ? String(it.taxRatePercent) : ""} onChange={(e) => updateItem(idx, "taxRatePercent", e.target.value === "" ? 0 : Number(e.target.value))}>
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
        </div>
        <button className="btn btn-sm" onClick={addItem}>+ Add Item</button>
      </div>

      {!purchaseId && (
        <div className="form-card">
          <h3>Payments (optional)</h3>
          {payments.map((p, idx) => (
            <div className="form-row" key={idx} style={{ marginBottom: 8 }}>
              <div className="form-group"><label>Amount</label><input type="number" style={{ width: 120 }} value={p.amount} onChange={(e) => updatePayment(idx, "amount", e.target.value)} /></div>
              <div className="form-group"><label>Mode</label>
                <select value={p.mode} onChange={(e) => updatePayment(idx, "mode", e.target.value)}>
                  <option>Cash</option><option>Bank</option><option>UPI</option><option>Cheque</option><option>Credit</option>
                </select>
              </div>
              <div className="form-group"><label>Date</label><input type="date" value={p.date} onChange={(e) => updatePayment(idx, "date", e.target.value)} /></div>
              <div className="form-group"><label>Reference</label><input value={p.reference} onChange={(e) => updatePayment(idx, "reference", e.target.value)} /></div>
              <button className="btn btn-sm" onClick={() => removePayment(idx)}>✕</button>
            </div>
          ))}
          <button className="btn btn-sm" onClick={addPayment}>+ Add Payment</button>
        </div>
      )}

      <div className="form-card" style={{ maxWidth: 420 }}>
        <div className="form-row">
          <div className="form-group"><label>Round-off Mode</label>
            <select value={roundOffMode} onChange={(e) => setRoundOffMode(e.target.value)}>
              <option value="NEAREST">Nearest</option>
              <option value="UP">Up</option>
              <option value="DOWN">Down</option>
              <option value="NONE">None</option>
            </select>
          </div>
          <div className="form-group"><label>Other Charges</label><input type="number" style={{ width: 120 }} value={otherCharges} onChange={(e) => setOtherCharges(e.target.value)} /></div>
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={reverseCharge} onChange={(e) => setReverseCharge(e.target.checked)} /> Reverse Charge (RCM)</label>
        <div style={{ marginTop: 10 }}>
          <div className="totals-row"><span>Taxable</span><span>{taxableTotal.toFixed(2)}</span></div>
          {lineDiscountTotal > 0 && <div className="totals-row"><span>Item Discount</span><span>(-{lineDiscountTotal.toFixed(2)})</span></div>}
          {taxMode === "INTRA_STATE_GST" && <>
            <div className="totals-row"><span>CGST ({fmtPercent(taxPercent(cgstTotal, taxableTotal))}%)</span><span>{cgstTotal.toFixed(2)}</span></div>
            <div className="totals-row"><span>SGST ({fmtPercent(taxPercent(sgstTotal, taxableTotal))}%)</span><span>{sgstTotal.toFixed(2)}</span></div>
          </>}
          {taxMode === "INTER_STATE_GST" && <div className="totals-row"><span>IGST ({fmtPercent(taxPercent(igstTotal, taxableTotal))}%)</span><span>{igstTotal.toFixed(2)}</span></div>}
          {other > 0 && <div className="totals-row"><span>Other Charges</span><span>{other.toFixed(2)}</span></div>}
          <div className="totals-row totals-grand"><span>Grand Total</span><span>{grandTotal.toFixed(2)}</span></div>
        </div>
      </div>

      {error && <p className="error-msg">{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary" onClick={save} disabled={saving || !supplierId}>Save as Draft</button>
        <button className="btn" onClick={() => onSaved && onSaved(null)}>Cancel</button>
      </div>

      {showQuickAdd && (
        <QuickAddSupplier
          existingSuppliers={suppliers}
          onCreated={(s) => { setSuppliers(prev => [...prev, s]); setSupplierId(s.id); setShowQuickAdd(false); }}
          onClose={() => setShowQuickAdd(false)}
        />
      )}
    </div>
  );
}
