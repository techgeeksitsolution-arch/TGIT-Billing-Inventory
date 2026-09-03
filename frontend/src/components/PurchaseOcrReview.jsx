import { useState, useEffect } from "react";
import { apiPost } from "../api";
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

const fmtPct = (v) => { const s = Number(v).toFixed(1); return s.endsWith(".0") ? s.slice(0, -2) : s; };

export default function PurchaseOcrReview({ ocrData, previewUrl, onSaved, onCancel, onBack }) {
  const [suppliers, setSuppliers] = useState(ocrData.suppliers || []);
  const [products, setProducts] = useState(ocrData.products || []);
  const [taxRates, setTaxRates] = useState(ocrData.taxRates || []);
  const [supplierId, setSupplierId] = useState(ocrData.matchedSupplier?.id || "");
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState(ocrData.extracted?.invoice?.supplierInvoiceNo || "");
  const [invoiceDate, setInvoiceDate] = useState(ocrData.extracted?.invoice?.invoiceDate || new Date().toISOString().slice(0, 10));
  const [taxMode, setTaxMode] = useState(ocrData.autoTaxMode || "INTRA_STATE_GST");
  const [placeOfSupply, setPlaceOfSupply] = useState(ocrData.extracted?.invoice?.placeOfSupply || "");
  const [poNo, setPoNo] = useState(ocrData.extracted?.invoice?.poNo || "");
  const [otherCharges, setOtherCharges] = useState(ocrData.extracted?.totals?.otherCharges || 0);
  const [roundOffMode, setRoundOffMode] = useState("NEAREST");
  const [items, setItems] = useState([]);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [checkingDup, setCheckingDup] = useState(false);
  const [supplierInfo, setSupplierInfo] = useState(null);
  const [showNewProduct, setShowNewProduct] = useState(null);

  useEffect(() => {
    const initItems = (ocrData.matchedItems || []).map(it => ({
      productId: it.productId || "",
      description: it.description || it.productName || "",
      hsnCode: it.hsnCode || "",
      quantity: it.quantity || 1,
      unitPrice: it.unitPrice || 0,
      discount: it.discount || 0,
      uom: it.uom || "Nos",
      taxRatePercent: it.taxRatePercent || 0,
    }));
    setItems(initItems.length > 0 ? initItems : [{ productId: "", description: "", hsnCode: "", quantity: 1, unitPrice: 0, discount: 0, uom: "Nos", taxRatePercent: 0 }]);
  }, [ocrData]);

  useEffect(() => {
    if (!supplierId) { setSupplierInfo(null); return; }
    fetch(`/api/v1/suppliers/${supplierId}`).then(r => r.json()).then(setSupplierInfo).catch(() => {});
  }, [supplierId]);

  useEffect(() => {
    if (!supplierId || !supplierInvoiceNo) { setDuplicateWarning(null); return; }
    setCheckingDup(true);
    const timer = setTimeout(() => {
      fetch(`/api/v1/purchases/check-duplicate?supplierId=${supplierId}&supplierInvoiceNo=${encodeURIComponent(supplierInvoiceNo)}&invoiceDate=${invoiceDate || ""}`)
        .then(r => r.json())
        .then(d => { setDuplicateWarning(d.duplicate ? d : null); setCheckingDup(false); })
        .catch(() => { setCheckingDup(false); });
    }, 500);
    return () => clearTimeout(timer);
  }, [supplierId, supplierInvoiceNo, invoiceDate]);

  const selectProduct = (idx, productId) => {
    const updated = [...items];
    updated[idx].productId = productId;
    if (productId) {
      const prod = products.find(p => p.id === productId);
      if (prod) {
        updated[idx].description = prod.name;
        updated[idx].hsnCode = prod.hsnCode || "";
        updated[idx].taxRatePercent = prod.taxRate || 0;
        updated[idx].uom = prod.unit || "Nos";
      }
    }
    setItems(updated);
  };

  const updateItem = (idx, field, value) => {
    const updated = [...items];
    updated[idx][field] = value;
    setItems(updated);
  };
  const addItem = () => setItems([...items, { productId: "", description: "", hsnCode: "", quantity: 1, unitPrice: 0, discount: 0, uom: "Nos", taxRatePercent: 0 }]);
  const removeItem = (idx) => setItems(items.filter((_, i) => i !== idx));

  const computed = items.map(it => computeItem(it, taxMode, it.taxRatePercent));
  const taxableTotal = roundTo2(computed.reduce((s, c) => s + c.taxableValue, 0));
  const cgstTotal = roundTo2(computed.reduce((s, c) => s + c.cgstAmount, 0));
  const sgstTotal = roundTo2(computed.reduce((s, c) => s + c.sgstAmount, 0));
  const igstTotal = roundTo2(computed.reduce((s, c) => s + c.igstAmount, 0));
  const grandTotal = roundTo2(taxableTotal + cgstTotal + sgstTotal + igstTotal + Number(otherCharges) || 0);

  const save = async () => {
    if (!supplierId) { setError("Select a supplier"); return; }
    if (duplicateWarning) { setError("Fix duplicate invoice before saving"); return; }
    setSaving(true); setError(null);
    const payload = {
      supplierId, supplierInvoiceNo, invoiceDate, taxMode,
      placeOfSupply: placeOfSupply || null,
      poNo: poNo || null,
      otherCharges: Number(otherCharges) || 0,
      roundOffMode,
      items: items.map(it => ({
        productId: it.productId || null, description: it.description,
        hsnCode: it.hsnCode, quantity: Number(it.quantity),
        unitPrice: Number(it.unitPrice), discount: Number(it.discount) || 0,
        uom: it.uom || "Nos",
        taxRate: it.taxRatePercent ? Number(it.taxRatePercent) : undefined,
      })),
    };
    try {
      const purchase = await apiPost("/purchases", payload);
      if (ocrData.jobId) {
        await apiPost(`/purchases/ocr/${ocrData.jobId}/apply`, { ...payload, purchaseId: purchase.id }).catch(() => {});
      }
      onSaved && onSaved(purchase.id);
    } catch (e) {
      if (e.code === "DUPLICATE_INVOICE") {
        setDuplicateWarning({ duplicate: true, existing: e.details || {} });
        setError(e.message);
      } else {
        setError(e.message || "Save failed");
      }
    } finally { setSaving(false); }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Review OCR Purchase Invoice</h1>
        <div className="header-actions">
          <button className="btn" onClick={onBack}>Back to Upload</button>
        </div>
      </div>

      {ocrData.ocrStatus === "NOT_CONFIGURED" && (
        <div className="info-msg">OCR provider not configured — data entered manually. Configure OCR in Settings to enable auto-extraction.</div>
      )}
      {ocrData.ocrStatus === "OCR_FAILED" && (
        <div className="warning-msg">OCR extraction failed — please enter data manually.</div>
      )}
      {ocrData.ocrStatus === "EXTRACTED" && (
        <div className="success-msg">Text extracted from invoice. Review and correct the data below.</div>
      )}

      {previewUrl && (
        <div className="form-card">
          <h3>Invoice Image</h3>
          <img src={previewUrl} alt="Invoice preview" style={{ maxWidth: "100%", maxHeight: 400, borderRadius: 8, border: "1px solid #e2e8f0" }} />
        </div>
      )}

      <div className="form-card">
        <h3>Supplier Details</h3>
        <div className="form-row">
          <div className="form-group" style={{ flex: 2 }}>
            <label>Supplier *</label>
            <div className="inline-quick-add">
              <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">Select supplier</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}{s.gstNumber ? ` (${s.gstNumber})` : ""}</option>)}
              </select>
              <button type="button" className="btn btn-sm btn-outline" onClick={() => setShowQuickAdd(true)}>+ New Supplier</button>
            </div>
          </div>
          <div className="form-group"><label>GSTIN (auto)</label><input value={suppliers.find(s => s.id === supplierId)?.gstNumber || ""} disabled /></div>
        </div>
        {!supplierId && ocrData.extracted?.supplier?.name && (
          <div className="info-msg" style={{ marginTop: 8 }}>
            OCR extracted: <strong>{ocrData.extracted.supplier.name}</strong>
            {ocrData.extracted.supplier.gstin && <> (GSTIN: {ocrData.extracted.supplier.gstin})</>}
            {ocrData.extracted.supplier.phone && <> | Phone: {ocrData.extracted.supplier.phone}</>}
            {" "}— not found in suppliers. Click "+ New Supplier" to add, or select a matching supplier above.
          </div>
        )}
        {supplierInfo && (
          <div className="supplier-info-box">
            {supplierInfo.address && <span><strong>Address:</strong> {supplierInfo.address}</span>}
            {supplierInfo.state && <span><strong>State:</strong> {supplierInfo.state}</span>}
            {supplierInfo.phone && <span><strong>Phone:</strong> {supplierInfo.phone}</span>}
            {supplierInfo.email && <span><strong>Email:</strong> {supplierInfo.email}</span>}
          </div>
        )}
        {duplicateWarning && (
          <div className="warning-msg" style={{ marginTop: 8 }}>
            ⚠ Duplicate detected: Invoice {supplierInvoiceNo} already exists as {duplicateWarning.existing?.internalNumber} (status: {duplicateWarning.existing?.status}).
          </div>
        )}
      </div>

      <div className="form-card">
        <h3>Invoice Details</h3>
        <div className="form-row">
          <div className="form-group"><label>Supplier Invoice No *</label><input value={supplierInvoiceNo} onChange={(e) => setSupplierInvoiceNo(e.target.value)} /></div>
          <div className="form-group"><label>Invoice Date *</label><input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} /></div>
          <div className="form-group"><label>Tax Mode</label>
            <select value={taxMode} onChange={(e) => setTaxMode(e.target.value)}>
              <option value="NON_GST">Non-GST</option>
              <option value="INTRA_STATE_GST">Intra-State GST</option>
              <option value="INTER_STATE_GST">Inter-State GST</option>
              <option value="EXEMPT">Exempt</option>
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group"><label>Place of Supply</label><input value={placeOfSupply} onChange={(e) => setPlaceOfSupply(e.target.value)} /></div>
          <div className="form-group"><label>PO No</label><input value={poNo} onChange={(e) => setPoNo(e.target.value)} /></div>
          <div className="form-group"><label>Other Charges</label><input type="number" value={otherCharges} onChange={(e) => setOtherCharges(e.target.value)} /></div>
        </div>
      </div>

      <div className="form-card">
        <h3>Items</h3>
        <div className="items-table-container">
          <table className="items-table">
            <thead>
              <tr>
                <th className="col-idx">#</th>
                <th className="col-type">Product</th>
                <th className="col-desc">Description</th>
                <th className="col-hsn">HSN/SAC</th>
                <th className="col-gst">GST %</th>
                <th className="col-rate">Rate</th>
                <th className="col-qty">Qty</th>
                <th className="col-uom">UOM</th>
                <th className="col-taxable">Taxable</th>
                <th className="col-tax">GST Amt</th>
                <th className="col-total">Total</th>
                <th className="col-action"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={idx}>
                  <td>{idx + 1}</td>
                  <td className="col-type">
                    <select value={it.productId} onChange={(e) => selectProduct(idx, e.target.value)}>
                      <option value="">— Manual —</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name}{p.sku ? ` [${p.sku}]` : ""}</option>)}
                    </select>
                  </td>
                  <td className="col-desc"><input value={it.description} onChange={(e) => updateItem(idx, "description", e.target.value)} /></td>
                  <td className="col-hsn"><input value={it.hsnCode} onChange={(e) => updateItem(idx, "hsnCode", e.target.value)} /></td>
                  <td className="col-gst">
                    <select value={it.taxRatePercent || ""} onChange={(e) => updateItem(idx, "taxRatePercent", e.target.value === "" ? 0 : Number(e.target.value))}>
                      <option value="">Auto</option>
                      {taxRates.map(t => <option key={t.id} value={String(t.rate)}>{t.rate}%</option>)}
                    </select>
                  </td>
                  <td className="col-rate"><input type="number" min="0" step="0.01" value={it.unitPrice} onChange={(e) => updateItem(idx, "unitPrice", e.target.value)} /></td>
                  <td className="col-qty"><input type="number" min="0" step="0.001" value={it.quantity} onChange={(e) => updateItem(idx, "quantity", e.target.value)} /></td>
                  <td className="col-uom"><input value={it.uom} onChange={(e) => updateItem(idx, "uom", e.target.value)} /></td>
                  <td className="col-taxable amount">{computed[idx]?.taxableValue.toFixed(2)}</td>
                  <td className="col-tax amount">{(computed[idx]?.cgstAmount + computed[idx]?.sgstAmount + computed[idx]?.igstAmount).toFixed(2)}</td>
                  <td className="col-total amount bold">{computed[idx]?.totalAmount.toFixed(2)}</td>
                  <td className="col-action"><button className="btn btn-sm btn-danger" onClick={() => removeItem(idx)} disabled={items.length <= 1}>x</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className="btn btn-sm" onClick={addItem}>+ Add Item</button>
      </div>

      <div className="form-card" style={{ maxWidth: 420 }}>
        <div className="form-row">
          <div className="form-group"><label>Round-off Mode</label>
            <select value={roundOffMode} onChange={(e) => setRoundOffMode(e.target.value)}>
              <option value="NEAREST">Nearest</option><option value="UP">Up</option><option value="DOWN">Down</option><option value="NONE">None</option>
            </select>
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <div className="totals-row"><span>Taxable</span><span>{taxableTotal.toFixed(2)}</span></div>
          {taxMode === "INTRA_STATE_GST" && <>
            <div className="totals-row"><span>CGST ({fmtPct(computed[0]?.cgstRate || 0)}%)</span><span>{cgstTotal.toFixed(2)}</span></div>
            <div className="totals-row"><span>SGST ({fmtPct(computed[0]?.sgstRate || 0)}%)</span><span>{sgstTotal.toFixed(2)}</span></div>
          </>}
          {taxMode === "INTER_STATE_GST" && <div className="totals-row"><span>IGST ({fmtPct(computed[0]?.igstRate || 0)}%)</span><span>{igstTotal.toFixed(2)}</span></div>}
          {Number(otherCharges) > 0 && <div className="totals-row"><span>Other Charges</span><span>{Number(otherCharges).toFixed(2)}</span></div>}
          <div className="totals-row totals-grand"><span>Grand Total</span><span>{grandTotal.toFixed(2)}</span></div>
        </div>
      </div>

      {error && <div className="error-msg">{error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary" onClick={save} disabled={saving || !supplierId || !!duplicateWarning}>
          {saving ? "Saving..." : "Save Purchase Invoice"}
        </button>
        <button className="btn" onClick={onCancel}>Cancel</button>
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
