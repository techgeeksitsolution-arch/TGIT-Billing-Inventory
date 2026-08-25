import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiPost, apiPut } from "../api";
import { applyRoundOff, ROUND_OFF_MODES } from "../lib/invoiceTotals.js";

const EMPTY_ITEM = { productId: "", serviceId: "", description: "", hsnSac: "", quantity: 1, unitRate: 0 };
const TAX_MODES = [
  { value: "NON_GST", label: "Non-GST" },
  { value: "INTRA_STATE_GST", label: "Intra-State GST (CGST + SGST)" },
  { value: "INTER_STATE_GST", label: "Inter-State GST (IGST)" },
  { value: "EXEMPT", label: "Exempt" },
];

function calcItem(item, taxMode, taxRate) {
  const qty = Number(item.quantity) || 0;
  const rate = Number(item.unitRate) || 0;
  const taxableValue = Math.round(qty * rate * 100) / 100;
  const tr = Number(taxRate) || 0;
  let cgstRate = 0, sgstRate = 0, igstRate = 0;
  let cgstAmount = 0, sgstAmount = 0, igstAmount = 0;
  if (taxMode === "INTRA_STATE_GST") {
    cgstRate = tr / 2; sgstRate = tr / 2;
    cgstAmount = Math.round(taxableValue * cgstRate) / 100;
    sgstAmount = Math.round(taxableValue * sgstRate) / 100;
  } else if (taxMode === "INTER_STATE_GST") {
    igstRate = tr;
    igstAmount = Math.round(taxableValue * igstRate) / 100;
  }
  const totalAmount = Math.round((taxableValue + cgstAmount + sgstAmount + igstAmount) * 100) / 100;
  return { taxableValue, cgstRate, sgstRate, igstRate, cgstAmount, sgstAmount, igstAmount, totalAmount };
}

export function SalesForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [services, setServices] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [form, setForm] = useState({
    customerId: "",
    invoiceDate: new Date().toISOString().split("T")[0],
    workOrderNo: "",
    taxMode: "NON_GST",
    placeOfSupply: "",
    invoiceNumberMode: "AUTO",
    invoiceNumber: "",
    discount: 0,
    otherCharges: 0,
    roundOffMode: "NEAREST",
    items: [{ ...EMPTY_ITEM }],
  });

  useEffect(() => {
    fetch("/api/v1/customers").then(r => r.json()).then(setCustomers).catch(() => {});
    fetch("/api/v1/products").then(r => r.json()).then(setProducts).catch(() => {});
    fetch("/api/v1/services").then(r => r.json()).then(setServices).catch(() => {});
  }, []);

  useEffect(() => {
    if (isEdit) {
      fetch(`/api/v1/sales/${id}`)
        .then(r => r.json())
        .then(inv => {
          setForm({
            customerId: inv.customerId || "",
            invoiceDate: inv.invoiceDate?.split("T")[0] || "",
            workOrderNo: inv.workOrderNo || "",
            taxMode: inv.taxMode,
            placeOfSupply: inv.placeOfSupply || "",
            invoiceNumberMode: "AUTO",
            invoiceNumber: "",
            discount: Number(inv.discount) || 0,
            otherCharges: Number(inv.otherCharges) || 0,
            roundOffMode: inv.roundOffMode || "NEAREST",
            items: inv.items?.length ? inv.items.map(i => ({
              productId: i.productId || "",
              serviceId: i.serviceId || "",
              description: i.description,
              hsnSac: i.hsnSac || "",
              quantity: Number(i.quantity),
              unitRate: Number(i.unitRate),
            })) : [{ ...EMPTY_ITEM }],
          });
        })
        .catch(e => setError(e.message));
    }
  }, [id, isEdit]);

  const updateItem = (index, field, value) => {
    const items = [...form.items];
    items[index] = { ...items[index], [field]: value };
    if (field === "productId" && value) {
      const product = products.find(p => p.id === value);
      if (product) {
        items[index].description = product.name;
        items[index].hsnSac = product.hsnCode || "";
        items[index].unitRate = Number(product.sellingPrice);
      }
    }
    if (field === "serviceId" && value) {
      const service = services.find(s => s.id === value);
      if (service) {
        items[index].description = service.name;
        items[index].hsnSac = service.sacCode || "";
        items[index].unitRate = Number(service.defaultRate);
      }
    }
    setForm({ ...form, items });
  };

  const addItem = () => setForm({ ...form, items: [...form.items, { ...EMPTY_ITEM }] });
  const removeItem = (index) => {
    if (form.items.length <= 1) return;
    setForm({ ...form, items: form.items.filter((_, i) => i !== index) });
  };

  const getItemTaxRate = (item) => {
    if (item.productId) {
      const product = products.find(p => p.id === item.productId);
      return product?.taxRate?.rate || 0;
    }
    if (item.serviceId) {
      const service = services.find(s => s.id === item.serviceId);
      return service?.taxRate?.rate || 0;
    }
    return 0;
  };

  const calculatedItems = form.items.map(item => ({
    ...item,
    ...calcItem(item, form.taxMode, getItemTaxRate(item)),
  }));

  const totals = calculatedItems.reduce(
    (acc, item) => ({
      taxableTotal: acc.taxableTotal + item.taxableValue,
      cgstTotal: acc.cgstTotal + item.cgstAmount,
      sgstTotal: acc.sgstTotal + item.sgstAmount,
      igstTotal: acc.igstTotal + item.igstAmount,
    }),
    { taxableTotal: 0, cgstTotal: 0, sgstTotal: 0, igstTotal: 0 }
  );
  const totalTax = totals.cgstTotal + totals.sgstTotal + totals.igstTotal;
  const discount = Number(form.discount) || 0;
  const otherCharges = Number(form.otherCharges) || 0;
  const calculatedTotal = Math.round((totals.taxableTotal + totalTax + otherCharges - discount) * 100) / 100;
  const { grandTotal, roundOff } = applyRoundOff(calculatedTotal, form.roundOffMode);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        customerId: form.customerId || undefined,
        invoiceDate: form.invoiceDate,
        workOrderNo: form.workOrderNo || undefined,
        taxMode: form.taxMode,
        placeOfSupply: form.placeOfSupply || undefined,
        discount,
        otherCharges,
        roundOffMode: form.roundOffMode,
        invoiceNumberMode: form.invoiceNumberMode,
        invoiceNumber: form.invoiceNumber || undefined,
        items: form.items.map(i => ({
          productId: i.productId || undefined,
          serviceId: i.serviceId || undefined,
          description: i.description,
          hsnSac: i.hsnSac,
          quantity: Number(i.quantity),
          unitRate: Number(i.unitRate),
        })),
      };
      let result;
      if (isEdit) {
        result = await apiPut(`/sales/${id}`, payload);
      } else {
        result = await apiPost("/sales", payload);
      }
      navigate(`/sales/${result.id}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>{isEdit ? `Edit Invoice` : "New Sales Invoice"}</h1>
        <button className="btn btn-outline" onClick={() => navigate("/sales")}>Back to List</button>
      </div>

      {error && <div className="error-msg">{error}</div>}

      <div className="form-card">
        <div className="form-row">
          <div className="form-group">
            <label>Customer</label>
            <select value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
              <option value="">-- Select Customer --</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Invoice Date</label>
            <input type="date" value={form.invoiceDate} onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Work Order No. (optional)</label>
            <input type="text" value={form.workOrderNo} onChange={(e) => setForm({ ...form, workOrderNo: e.target.value })} placeholder="e.g. WO-2026-001" />
          </div>
          <div className="form-group">
            <label>Tax Mode</label>
            <select value={form.taxMode} onChange={(e) => setForm({ ...form, taxMode: e.target.value })}>
              {TAX_MODES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Place of Supply</label>
            <input type="text" value={form.placeOfSupply} onChange={(e) => setForm({ ...form, placeOfSupply: e.target.value })} placeholder="e.g. Maharashtra" />
          </div>
        </div>

        {!isEdit && (
          <div className="form-row" style={{ marginTop: 12 }}>
            <div className="form-group">
              <label>Invoice Number</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select value={form.invoiceNumberMode} onChange={(e) => setForm({ ...form, invoiceNumberMode: e.target.value })} style={{ width: 130 }}>
                  <option value="AUTO">Auto</option>
                  <option value="MANUAL">Manual</option>
                </select>
                {form.invoiceNumberMode === "MANUAL" && (
                  <input type="text" value={form.invoiceNumber} onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })} placeholder="e.g. TGIT/010/26-27" style={{ flex: 1 }} />
                )}
              </div>
            </div>
          </div>
        )}
        {isEdit && (
          <div className="form-row" style={{ marginTop: 12 }}>
            <div className="form-group">
              <label>Invoice Number</label>
              <input type="text" value={form.invoiceNumber} disabled readOnly placeholder="(assigned)" />
            </div>
          </div>
        )}
      </div>

      <div className="form-card">
        <h3>Line Items</h3>
        <div className="items-table-container">
          <table className="items-table">
            <thead>
              <tr>
                <th className="col-idx">#</th>
                <th className="col-type">Type</th>
                <th className="col-product">Product / Service</th>
                <th className="col-desc">Description</th>
                <th className="col-hsn">HSN/SAC</th>
                <th className="col-qty">Qty</th>
                <th className="col-rate">Rate (₹)</th>
                <th className="col-taxable">Taxable (₹)</th>
                <th className="col-tax">GST (₹)</th>
                <th className="col-total">Total (₹)</th>
                <th className="col-action"></th>
              </tr>
            </thead>
            <tbody>
              {calculatedItems.map((item, idx) => (
                <tr key={idx}>
                  <td className="col-idx">{idx + 1}</td>
                  <td className="col-type">
                    <select value={item.productId || item.serviceId || ""} onChange={(e) => {
                      const val = e.target.value;
                      const isProduct = products.some(p => p.id === val);
                      updateItem(idx, "productId", isProduct ? val : "");
                      if (!isProduct) updateItem(idx, "serviceId", val);
                    }}>
                      <option value="">-- Select --</option>
                      {products.length > 0 && <optgroup label="Products">{products.map(p => <option key={p.id} value={p.id}>{p.name} (Stock: {Number(p.currentStock)})</option>)}</optgroup>}
                      {services.length > 0 && <optgroup label="Services">{services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>}
                    </select>
                  </td>
                  <td className="col-desc"><input type="text" value={item.description} onChange={(e) => updateItem(idx, "description", e.target.value)} /></td>
                  <td className="col-hsn"><input type="text" value={item.hsnSac} onChange={(e) => updateItem(idx, "hsnSac", e.target.value)} style={{ width: 80 }} /></td>
                  <td className="col-qty"><input type="number" min="0" step="0.001" value={item.quantity} onChange={(e) => updateItem(idx, "quantity", e.target.value)} style={{ width: 80 }} /></td>
                  <td className="col-rate"><input type="number" min="0" step="0.01" value={item.unitRate} onChange={(e) => updateItem(idx, "unitRate", e.target.value)} style={{ width: 100 }} /></td>
                  <td className="col-taxable amount">{item.taxableValue.toFixed(2)}</td>
                  <td className="col-tax amount">{(item.cgstAmount + item.sgstAmount + item.igstAmount).toFixed(2)}</td>
                  <td className="col-total amount">{item.totalAmount.toFixed(2)}</td>
                  <td className="col-action"><button className="btn btn-sm btn-danger" onClick={() => removeItem(idx)} disabled={calculatedItems.length <= 1}>x</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className="btn btn-outline" onClick={addItem}>+ Add Item</button>
      </div>

      <div className="form-card">
        <h3>Charges & Round Off</h3>
        <div className="form-row">
          <div className="form-group">
            <label>Discount (₹)</label>
            <input type="number" min="0" step="0.01" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} style={{ width: 140 }} />
          </div>
          <div className="form-group">
            <label>Other Charges (₹)</label>
            <input type="number" min="0" step="0.01" value={form.otherCharges} onChange={(e) => setForm({ ...form, otherCharges: e.target.value })} style={{ width: 140 }} />
          </div>
          <div className="form-group">
            <label>Round Off Mode</label>
            <select value={form.roundOffMode} onChange={(e) => setForm({ ...form, roundOffMode: e.target.value })} style={{ width: 180 }}>
              {ROUND_OFF_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="totals-card">
        <div className="totals-grid">
          <div className="totals-row"><span>Taxable Total:</span><span>₹{totals.taxableTotal.toFixed(2)}</span></div>
          {form.taxMode === "INTRA_STATE_GST" && <>
            <div className="totals-row"><span>CGST:</span><span>₹{totals.cgstTotal.toFixed(2)}</span></div>
            <div className="totals-row"><span>SGST:</span><span>₹{totals.sgstTotal.toFixed(2)}</span></div>
          </>}
          {form.taxMode === "INTER_STATE_GST" && (
            <div className="totals-row"><span>IGST:</span><span>₹{totals.igstTotal.toFixed(2)}</span></div>
          )}
          <div className="totals-row"><span>Total Tax:</span><span>₹{totalTax.toFixed(2)}</span></div>
          <div className="totals-row"><span>Discount:</span><span>₹{discount.toFixed(2)}</span></div>
          <div className="totals-row"><span>Other Charges:</span><span>₹{otherCharges.toFixed(2)}</span></div>
          <div className="totals-row"><span>Calculated Total:</span><span>₹{calculatedTotal.toFixed(2)}</span></div>
          <div className="totals-row"><span>Round Off:</span><span>₹{roundOff.toFixed(2)}</span></div>
          <div className="totals-row totals-grand"><span>Grand Total:</span><span>₹{grandTotal.toLocaleString("en-IN")}.00</span></div>
        </div>
      </div>

      <div className="form-actions">
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : isEdit ? "Update Draft" : "Save as Draft"}
        </button>
        <button className="btn btn-outline" onClick={() => navigate("/sales")}>Cancel</button>
      </div>
    </div>
  );
}
