import { useEffect, useState } from "react";

export function SupplierList({ onEdit, onNew }) {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", gstNumber: "", address: "", phone: "", mobile: "", email: "", state: "", pin: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    const q = search ? `?search=${encodeURIComponent(search)}` : "";
    const res = await fetch(`/api/v1/suppliers${q}`);
    setSuppliers(await res.json());
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", gstNumber: "", address: "", phone: "", mobile: "", email: "", state: "", pin: "", notes: "" });
    if (onNew) onNew();
  };
  const openEdit = (s) => {
    setEditing(s.id);
    setForm({ name: s.name, gstNumber: s.gstNumber || "", address: s.address || "", phone: s.phone || "", mobile: s.mobile || "", email: s.email || "", state: s.state || "", pin: s.pin || "", notes: s.notes || "" });
  };
  const save = async () => {
    setSaving(true); setError(null);
    try {
      const method = editing ? "PUT" : "POST";
      const url = editing ? `/api/v1/suppliers/${editing}` : "/api/v1/suppliers";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) throw new Error("Save failed");
      setEditing(null);
      await load();
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Suppliers</h1>
        <button className="btn btn-primary" onClick={openNew}>Add Supplier</button>
      </div>

      <input className="search-input" placeholder="Search by name or GSTIN" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} />
      {editing !== undefined && (
        <div className="form-card">
          <h3>{editing ? "Edit Supplier" : "New Supplier"}</h3>
          <div className="form-row">
            <div className="form-group"><label>Name *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="form-group"><label>GSTIN</label><input value={form.gstNumber} onChange={(e) => setForm({ ...form, gstNumber: e.target.value })} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Phone</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="form-group"><label>Mobile</label><input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} /></div>
            <div className="form-group"><label>Email</label><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Address</label><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div className="form-group"><label>State</label><input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></div>
            <div className="form-group"><label>PIN</label><input value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} /></div>
          </div>
          <div className="form-group"><label>Notes</label><textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          {error && <p className="error-msg">{error}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" onClick={save} disabled={saving || !form.name}>Save</button>
            <button className="btn" onClick={() => setEditing(undefined)}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? <p>Loading…</p> : (
        <table className="data-table">
          <thead><tr><th>Name</th><th>GSTIN</th><th>Phone</th><th>Email</th><th></th></tr></thead>
          <tbody>
            {suppliers.length === 0 && <tr><td colSpan={5}>No suppliers found.</td></tr>}
            {suppliers.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.gstNumber || "—"}</td>
                <td>{s.phone || s.mobile || "—"}</td>
                <td>{s.email || "—"}</td>
                <td><button className="btn btn-sm" onClick={() => openEdit(s)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
