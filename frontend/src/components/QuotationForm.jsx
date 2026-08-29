import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiPost, apiPut } from "../api";
import { taxPercent, fmtPercent } from "../lib/invoiceTotals.js";

const EMPTY_ITEM = { productId: "", serviceId: "", description: "", hsnSac: "", quantity: 1, unitRate: 0, taxRate: "", uom: "Nos" };
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

export function QuotationForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [services, setServices] = useState([]);
  const [taxRates, setTaxRates] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [form, setForm] = useState({
    customerId: "",
    customerName: "",
    customerPhone: "",
    customerAddress: "",
    workOrderNo: "",
    quotationDate: new Date().toISOString().split("T")[0],
    taxMode: "NON_GST",
    placeOfSupply: "",
    notes: "",
    items: [{ ...EMPTY_ITEM }],
  });

  useEffect(() => {
    fetch("/api/v1/customers").then(r => r.json()).then(setCustomers).catch(() => {});
    fetch("/api/v1/products").then(r => r.json()).then(setProducts).catch(() => {});
    fetch("/api/v1/services").then(r => r.json()).then(setServices).catch(() => {});
    fetch("/api/v1/tax-rates").then(r => r.json()).then(setTaxRates).catch(() => {});
  }, []);

  useEffect(() => {
    if (isEdit) {
      fetch(`/api/v1/quotations/${id}`)
        .then(r => { if (!r.ok) throw new Error("Not found"); return r.json(); })
        .then(q => {
          setForm({
            customerId: q.customerId || "",
            customerName: q.customerName || "",
            customerPhone: q.customerPhone || "",
            customerAddress: q.customerAddress || "",
            workOrderNo: q.workOrderNo || "",
            quotationDate: q.quotationDate?.split("T")[0] || "",
            taxMode: q.taxMode,
            placeOfSupply: q.placeOfSupply || "",
            notes: q.notes || "",
            items: q.items?.length ? q.items.map(i => ({
              productId: i.productId || "",
              serviceId: i.serviceId || "",
              description: i.description,
              hsnSac: i.hsnSac || "",
              quantity: Number(i.quantity),
              unitRate: Number(i.unitRate),
              uom: i.uom || "Nos",
              taxRate: Number(i.cgstRate) * 2 || Number(i.igstRate) || "",
            })) : [{ ...EMPTY_ITEM }],
          });
        })
        .catch(e => setError(e.message));
    }
  }, [id, isEdit]);

  const handleCustomerChange = (customerId) => {
    const customer = customers.find(c => c.id === customerId);
    setForm({
      ...form,
      customerId: customerId,
      customerName: customer?.name || "",
      customerPhone: customer?.phone || "",
      customerAddress: customer?.address || "",
    });
  };

  const updateItem = (index, field, value) => {
    const items = [...form.items];
    items[index] = { ...items[index], [field]: value };
    if (field === "productId" && value) {
      const product = products.find(p => p.id === value);
      if (product) {
        items[index].description = product.name;
        items[index].hsnSac = product.hsnCode || "";
        items[index].unitRate = Number(product.sellingPrice);
        items[index].uom = product.unit?.name || "Nos";
        items[index].taxRate = product.taxRate ? Number(product.taxRate.rate) : "";
      }
    }
    if (field === "serviceId" && value) {
      const service = services.find(s => s.id === value);
      if (service) {
        items[index].description = service.name;
        items[index].hsnSac = service.sacCode || "";
        items[index].unitRate = Number(service.defaultRate);
        items[index].taxRate = service.taxRate ? Number(service.taxRate.rate) : "";
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

  const calculatedItems = form.items.map(item => {
    const tr = item.taxRate !== "" && item.taxRate != null ? Number(item.taxRate) : getItemTaxRate(item);
    return { ...item, ...calcItem(item, form.taxMode, tr) };
  });

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
  const grandTotalPreRound = totals.taxableTotal + totalTax;
  const grandTotal = Math.round(grandTotalPreRound);
  const roundOff = Math.round((grandTotal - grandTotalPreRound) * 100) / 100;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        customerId: form.customerId || undefined,
        customerName: form.customerName || "Walk-in Customer",
        customerPhone: form.customerPhone || undefined,
        customerAddress: form.customerAddress || undefined,
        workOrderNo: form.workOrderNo || undefined,
        quotationDate: form.quotationDate,
        taxMode: form.taxMode,
        placeOfSupply: form.placeOfSupply || undefined,
        notes: form.notes || undefined,
        items: form.items.map(i => ({
          productId: i.productId || undefined,
          serviceId: i.serviceId || undefined,
          description: i.description,
          hsnSac: i.hsnSac,
          uom: i.uom || "Nos",
          quantity: Number(i.quantity),
          unitRate: Number(i.unitRate),
          taxRate: i.taxRate === "" || i.taxRate == null ? undefined : Number(i.taxRate),
        })),
      };
      let result;
      if (isEdit) {
        result = await apiPut(`/quotations/${id}`, payload);
      } else {
        result = await apiPost("/quotations", payload);
      }
      navigate(`/quotations/${result.id}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>{isEdit ? "Edit Quotation" : "New Quotation"}</h1>
        <button className="btn btn-outline" onClick={() => navigate("/quotations")}>Back to List</button>
      </div>

      {error && <div className="error-msg">{error}</div>}

      <div className="form-card">
        <div className="form-row">
          <div className="form-group">
            <label>Customer</label>
            <select value={form.customerId} onChange={(e) => handleCustomerChange(e.target.value)}>
              <option value="">-- Select Customer --</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Customer Name *</label>
            <input type="text" value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} placeholder="Customer name" />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Phone</label>
            <input type="text" value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Address</label>
            <input type="text" value={form.customerAddress} onChange={(e) => setForm({ ...form, customerAddress: e.target.value })} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Quotation Date</label>
            <input type="date" value={form.quotationDate} onChange={(e) => setForm({ ...form, quotationDate: e.target.value })} />
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
        <div className="form-group">
          <label>Notes</label>
          <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Additional notes..." />
        </div>
      </div>

      <div className="form-card">
        <h3>Line Items</h3>
        <div className="items-table-container">
          <table className="items-table">
            <thead>
              <tr>
                <th className="col-idx">#</th>
                <th className="col-type">Type</th>
                <th className="col-desc">Description</th>
                 <th className="col-hsn">HSN/SAC</th>
                 <th className="col-gst">GST %</th>
                  <th className="col-qty">Qty</th>
                  <th className="col-uom">UOM</th>
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
                      {products.length > 0 && <optgroup label="Products">{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>}
                      {services.length > 0 && <optgroup label="Services">{services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>}
                    </select>
                  </td>
                  <td className="col-desc"><input type="text" value={item.description} onChange={(e) => updateItem(idx, "description", e.target.value)} /></td>
                   <td className="col-hsn"><input type="text" value={item.hsnSac} onChange={(e) => updateItem(idx, "hsnSac", e.target.value)} style={{ width: 80 }} /></td>
                   <td className="col-gst">
                     <select value={item.taxRate === "" || item.taxRate == null ? "" : String(item.taxRate)} onChange={(e) => updateItem(idx, "taxRate", e.target.value === "" ? "" : Number(e.target.value))} style={{ width: 80 }}>
                       <option value="">Auto</option>
                       {taxRates.map(t => <option key={t.id} value={String(t.rate)}>{t.rate}%</option>)}
                     </select>
                   </td>
                    <td className="col-qty"><input type="number" min="0" step="0.001" value={item.quantity} onChange={(e) => updateItem(idx, "quantity", e.target.value)} style={{ width: 80 }} /></td>
                    <td className="col-uom"><input type="text" list="uom-options" value={item.uom} onChange={(e) => updateItem(idx, "uom", e.target.value)} style={{ width: 90 }} placeholder="Nos" /></td>
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
        <button className="btn btn-sm btn-outline" onClick={addItem}>+ Add Item</button>
        <datalist id="uom-options">
          <option value="Nos" /><option value="Pcs" /><option value="Kg" /><option value="Mtr" /><option value="Set" /><option value="Box" /><option value="Ltr" />
        </datalist>
      </div>

      <div className="totals-card">
        <div className="totals-grid">
          <div className="totals-row"><span>Taxable Total:</span><span>₹{totals.taxableTotal.toFixed(2)}</span></div>
          {form.taxMode === "INTRA_STATE_GST" && <>
            <div className="totals-row"><span>CGST ({fmtPercent(taxPercent(totals.cgstTotal, totals.taxableTotal))}%):</span><span>₹{totals.cgstTotal.toFixed(2)}</span></div>
            <div className="totals-row"><span>SGST ({fmtPercent(taxPercent(totals.sgstTotal, totals.taxableTotal))}%):</span><span>₹{totals.sgstTotal.toFixed(2)}</span></div>
          </>}
          {form.taxMode === "INTER_STATE_GST" && (
            <div className="totals-row"><span>IGST ({fmtPercent(taxPercent(totals.igstTotal, totals.taxableTotal))}%):</span><span>₹{totals.igstTotal.toFixed(2)}</span></div>
          )}
          <div className="totals-row"><span>Total Tax:</span><span>₹{totalTax.toFixed(2)}</span></div>
          <div className="totals-row"><span>Round Off:</span><span>₹{roundOff.toFixed(2)}</span></div>
          <div className="totals-row totals-grand"><span>Grand Total:</span><span>₹{grandTotal.toLocaleString("en-IN")}.00</span></div>
        </div>
      </div>

      <div className="form-actions">
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : isEdit ? "Update Draft" : "Save as Draft"}
        </button>
        <button className="btn btn-outline" onClick={() => navigate("/quotations")}>Cancel</button>
      </div>
    </div>
  );
}
