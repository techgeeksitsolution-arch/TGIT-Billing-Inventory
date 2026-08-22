import { useState, useEffect } from "react";
import { apiPost } from "../api";

export function ServiceList() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", code: "", description: "", sacCode: "", defaultRate: "" });
  const [saving, setSaving] = useState(false);

  const loadServices = () => {
    fetch("/api/v1/services")
      .then(r => r.json())
      .then(data => { setServices(data); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  };

  useEffect(() => { loadServices(); }, []);

  const handleCreate = async () => {
    if (!form.name.trim() || !form.code.trim()) return setError("Name and Code are required");
    setSaving(true);
    setError(null);
    try {
      await apiPost("/services", {
        ...form,
        defaultRate: Number(form.defaultRate) || 0,
      });
      setForm({ name: "", code: "", description: "", sacCode: "", defaultRate: "" });
      setShowForm(false);
      loadServices();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Services</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "+ New Service"}
        </button>
      </div>

      {showForm && (
        <div className="form-card">
          <h3>New Service</h3>
          {error && <div className="error-msg">{error}</div>}
          <div className="form-row">
            <div className="form-group"><label>Name *</label><input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="form-group"><label>Code *</label><input type="text" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>SAC Code</label><input type="text" value={form.sacCode} onChange={(e) => setForm({ ...form, sacCode: e.target.value })} /></div>
            <div className="form-group"><label>Default Rate (₹)</label><input type="number" min="0" step="0.01" value={form.defaultRate} onChange={(e) => setForm({ ...form, defaultRate: e.target.value })} /></div>
          </div>
          <div className="form-row">
            <div className="form-group" style={{ gridColumn: "1 / -1" }}><label>Description</label><input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          </div>
          <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>{saving ? "Creating..." : "Create Service"}</button>
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
                <th>Code</th>
                <th>SAC Code</th>
                <th>Default Rate</th>
                <th>Description</th>
                <th>Tax Rate</th>
              </tr>
            </thead>
            <tbody>
              {services.length === 0 && <tr><td colSpan="6" className="empty-state">No services yet</td></tr>}
              {services.map(s => (
                <tr key={s.id}>
                  <td><strong>{s.name}</strong></td>
                  <td className="mono">{s.code}</td>
                  <td className="mono">{s.sacCode || "-"}</td>
                  <td className="amount">₹{Number(s.defaultRate).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  <td>{s.description || "-"}</td>
                  <td>{s.taxRate?.name || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
