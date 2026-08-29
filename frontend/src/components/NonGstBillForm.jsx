import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiPost, apiPut } from "../api";
import { applyRoundOff, ROUND_OFF_MODES } from "../lib/invoiceTotals.js";

const EMPTY_ITEM = { productId: "", description: "", price: 0, quantity: 1, uom: "Nos" };

export function NonGstBillForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [form, setForm] = useState({
    customerId: "",
    customerName: "",
    customerPhone: "",
    customerAddress: "",
    billDate: new Date().toISOString().split("T")[0],
    paymentMode: "",
    notes: "",
    discount: 0,
    otherCharges: 0,
    roundOffMode: "NEAREST",
    items: [{ ...EMPTY_ITEM }],
  });

  useEffect(() => {
    fetch("/api/v1/customers").then(r => r.json()).then(setCustomers).catch(() => {});
    fetch("/api/v1/products").then(r => r.json()).then(setProducts).catch(() => {});
  }, []);

  useEffect(() => {
    if (isEdit) {
      fetch(`/api/v1/nongst/${id}`)
        .then(r => r.json())
        .then(b => {
          setForm({
            customerId: b.customerId || "",
            customerName: b.customerName || "",
            customerPhone: b.customerPhone || "",
            customerAddress: b.customerAddress || "",
            billDate: b.billDate?.split("T")[0] || "",
            paymentMode: b.paymentMode || "",
            notes: b.notes || "",
            discount: Number(b.discount) || 0,
            otherCharges: Number(b.otherCharges) || 0,
            roundOffMode: b.roundOffMode || "NEAREST",
            items: b.items?.length ? b.items.map(i => ({
              productId: i.productId || "",
              description: i.description,
              price: Number(i.price),
              quantity: Number(i.quantity),
              uom: i.uom || "Nos",
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
        items[index].price = Number(product.sellingPrice);
        items[index].uom = product.unit?.name || "Nos";
      }
    }
    setForm({ ...form, items });
  };

  const addItem = () => setForm({ ...form, items: [...form.items, { ...EMPTY_ITEM }] });
  const removeItem = (index) => {
    if (form.items.length <= 1) return;
    setForm({ ...form, items: form.items.filter((_, i) => i !== index) });
  };

  const lineTotals = form.items.map(item => ({
    ...item,
    totalPrice: Math.round((Number(item.price) || 0) * (Number(item.quantity) || 0) * 100) / 100,
  }));

  const taxableTotal = lineTotals.reduce((s, i) => s + i.totalPrice, 0);
  const discount = Number(form.discount) || 0;
  const otherCharges = Number(form.otherCharges) || 0;
  const calculatedTotal = Math.round((taxableTotal + otherCharges - discount) * 100) / 100;
  const { grandTotal, roundOff } = applyRoundOff(calculatedTotal, form.roundOffMode);

  const handleCustomerSelect = (value) => {
    const customer = customers.find(c => c.id === value);
    setForm({
      ...form,
      customerId: value,
      customerName: customer?.name || "",
      customerPhone: customer?.phone || "",
      customerAddress: customer?.address || "",
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        customerId: form.customerId || undefined,
        customerName: form.customerName,
        customerPhone: form.customerPhone || undefined,
        customerAddress: form.customerAddress || undefined,
        billDate: form.billDate,
        paymentMode: form.paymentMode || undefined,
        notes: form.notes || undefined,
        discount,
        otherCharges,
        roundOffMode: form.roundOffMode,
        items: form.items.map(i => ({
          productId: i.productId || undefined,
          description: i.description,
          uom: i.uom || "Nos",
          price: Number(i.price),
          quantity: Number(i.quantity),
        })),
      };
      let result;
      if (isEdit) {
        result = await apiPut(`/nongst/${id}`, payload);
      } else {
        result = await apiPost("/nongst", payload);
      }
      navigate(`/nongst/${result.id}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>{isEdit ? "Edit Non-GST Bill" : "New Non-GST Bill"}</h1>
        <button className="btn btn-outline" onClick={() => navigate("/nongst")}>Back to List</button>
      </div>

      {error && <div className="error-msg">{error}</div>}

      <div className="form-card">
        <div className="form-row">
          <div className="form-group">
            <label>Customer (optional)</label>
            <select value={form.customerId} onChange={(e) => handleCustomerSelect(e.target.value)}>
              <option value="">-- Walk-in / Manual --</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Bill Date</label>
            <input type="date" value={form.billDate} onChange={(e) => setForm({ ...form, billDate: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Payment Mode</label>
            <input type="text" value={form.paymentMode} onChange={(e) => setForm({ ...form, paymentMode: e.target.value })} placeholder="e.g. Cash / UPI" />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Customer Name</label>
            <input type="text" value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Phone</label>
            <input type="text" value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} />
          </div>
        </div>
        <div className="form-group">
          <label>Address</label>
          <input type="text" value={form.customerAddress} onChange={(e) => setForm({ ...form, customerAddress: e.target.value })} />
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
                <th className="col-desc">Item Description</th>
                <th className="col-rate">Price (₹)</th>
                <th className="col-qty">Qty</th>
                <th className="col-uom">UOM</th>
                <th className="col-total">Total Price (₹)</th>
                <th className="col-action"></th>
              </tr>
            </thead>
            <tbody>
              {lineTotals.map((item, idx) => (
                <tr key={idx}>
                  <td className="col-idx">{idx + 1}</td>
                  <td className="col-type">
                    <select value={item.productId || ""} onChange={(e) => updateItem(idx, "productId", e.target.value)}>
                      <option value="">-- Manual --</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </td>
                  <td className="col-desc"><input type="text" value={item.description} onChange={(e) => updateItem(idx, "description", e.target.value)} /></td>
                  <td className="col-rate"><input type="number" min="0" step="0.01" value={item.price} onChange={(e) => updateItem(idx, "price", e.target.value)} style={{ width: 100 }} /></td>
                   <td className="col-qty"><input type="number" min="0" step="0.001" value={item.quantity} onChange={(e) => updateItem(idx, "quantity", e.target.value)} style={{ width: 80 }} /></td>
                   <td className="col-uom"><input type="text" list="uom-options" value={item.uom} onChange={(e) => updateItem(idx, "uom", e.target.value)} style={{ width: 90 }} placeholder="Nos" /></td>
                   <td className="col-total amount">{item.totalPrice.toFixed(2)}</td>
                  <td className="col-action"><button className="btn btn-sm btn-danger" onClick={() => removeItem(idx)} disabled={lineTotals.length <= 1}>x</button></td>
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
        <div className="form-group">
          <label>Notes</label>
          <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
        </div>
      </div>

      <div className="totals-card">
        <div className="totals-grid">
          <div className="totals-row"><span>Taxable Total:</span><span>₹{taxableTotal.toFixed(2)}</span></div>
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
        <button className="btn btn-outline" onClick={() => navigate("/nongst")}>Cancel</button>
      </div>
    </div>
  );
}
