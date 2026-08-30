import { useState, useEffect } from "react";
import { apiGet, apiPost } from "../api";

export function ProductList() {
  const [products, setProducts] = useState([]);
  const [taxRates, setTaxRates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", sku: "", sellingPrice: "", purchasePrice: "", currentStock: "", hsnCode: "", taxRateId: "" });
  const [saving, setSaving] = useState(false);

  const loadProducts = () => {
    setLoadError(null);
    apiGet("/products")
      .then(data => {
        setProducts(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(e => {
        setProducts([]);
        setLoadError(e.message || "Unable to load products");
        setLoading(false);
      });
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const handleCreate = async () => {
    if (!form.name.trim() || !form.sku.trim()) return setError("Name and SKU are required");
    setSaving(true);
    setError(null);
    try {
      await apiPost("/products", {
        ...form,
        sellingPrice: Number(form.sellingPrice) || 0,
        purchasePrice: Number(form.purchasePrice) || 0,
        currentStock: Number(form.currentStock) || 0,
        taxRateId: form.taxRateId || undefined,
      });
      setForm({ name: "", sku: "", sellingPrice: "", purchasePrice: "", currentStock: "", hsnCode: "", taxRateId: "" });
      setShowForm(false);
      loadProducts();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Products</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "+ New Product"}
        </button>
      </div>

      {showForm && (
        <div className="form-card">
          <h3>New Product</h3>
          {error && <div className="error-msg">{error}</div>}
          <div className="form-row">
            <div className="form-group"><label>Name *</label><input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="form-group"><label>SKU *</label><input type="text" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Selling Price (₹)</label><input type="number" min="0" step="0.01" value={form.sellingPrice} onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })} /></div>
            <div className="form-group"><label>Purchase Price (₹)</label><input type="number" min="0" step="0.01" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Current Stock</label><input type="number" min="0" step="0.001" value={form.currentStock} onChange={(e) => setForm({ ...form, currentStock: e.target.value })} /></div>
            <div className="form-group"><label>HSN Code</label><input type="text" value={form.hsnCode} onChange={(e) => setForm({ ...form, hsnCode: e.target.value })} /></div>
          </div>
          <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>{saving ? "Creating..." : "Create Product"}</button>
        </div>
      )}

      {loading && <div className="loading">Loading...</div>}
      {error && !showForm && <div className="error-msg">{error}</div>}
      {loadError && (
        <div className="error-msg">
          Unable to load products — {loadError}{" "}
          <button className="btn btn-sm" onClick={() => { setLoading(true); loadProducts(); }}>Retry</button>
        </div>
      )}

      {!loading && (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>SKU</th>
                <th>Selling Price</th>
                <th>Purchase Price</th>
                <th>Stock</th>
                <th>HSN</th>
                <th>Tax Rate</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 && (
                <tr>
                  <td colSpan="7" className="empty-state">
                    {loadError ? "Could not load products" : "No products yet"}
                  </td>
                </tr>
              )}
              {products.map(p => (
                <tr key={p.id}>
                  <td><strong>{p.name}</strong></td>
                  <td className="mono">{p.sku}</td>
                  <td className="amount">₹{Number(p.sellingPrice).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  <td className="amount">₹{Number(p.purchasePrice).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  <td className="amount">{Number(p.currentStock)}</td>
                  <td className="mono">{p.hsnCode || "-"}</td>
                  <td>{p.taxRate?.name || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
