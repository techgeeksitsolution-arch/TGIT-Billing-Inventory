import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../api";

export function CustomerList() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", customerType: "NON_GST", gstNumber: "", address: "", phone: "", email: "" });
  const [saving, setSaving] = useState(false);

  const loadCustomers = () => {
    fetch("/api/v1/customers")
      .then(r => r.json())
      .then(data => { setCustomers(data); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  };

  useEffect(() => { loadCustomers(); }, []);

  const handleCreate = async () => {
    if (!form.name.trim()) return setError("Customer name is required");
    setSaving(true);
    setError(null);
    try {
      await apiPost("/customers", form);
      setForm({ name: "", customerType: "NON_GST", gstNumber: "", address: "", phone: "", email: "" });
      setShowForm(false);
      loadCustomers();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Customers</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "+ New Customer"}
        </button>
      </div>

      {showForm && (
        <div className="form-card">
          <h3>New Customer</h3>
          {error && <div className="error-msg">{error}</div>}
          <div className="form-row">
            <div className="form-group"><label>Name *</label><input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Customer name" /></div>
            <div className="form-group"><label>Type</label>
              <select value={form.customerType} onChange={(e) => setForm({ ...form, customerType: e.target.value })}>
                <option value="NON_GST">Non-GST</option>
                <option value="REGULAR">Regular GST</option>
                <option value="COMPOSITION">Composition</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>GST Number</label><input type="text" value={form.gstNumber} onChange={(e) => setForm({ ...form, gstNumber: e.target.value })} placeholder="22AAAAA0000A1Z5" /></div>
            <div className="form-group"><label>Phone</label><input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Address</label><input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div className="form-group"><label>Email</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          </div>
          <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>{saving ? "Creating..." : "Create Customer"}</button>
        </div>
      )}

      {loading && <div className="loading">Loading...</div>}
      {error && !showForm && <div className="error-msg">{error}</div>}

      {!loading && (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>GST Number</th>
                <th>Phone</th>
                <th>Address</th>
                <th>Email</th>
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 && <tr><td colSpan="6" className="empty-state">No customers yet</td></tr>}
              {customers.map(c => (
                <tr key={c.id}>
                  <td><strong>{c.name}</strong></td>
                  <td>{c.customerType}</td>
                  <td className="mono">{c.gstNumber || "-"}</td>
                  <td>{c.phone || "-"}</td>
                  <td>{c.address || "-"}</td>
                  <td>{c.email || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
