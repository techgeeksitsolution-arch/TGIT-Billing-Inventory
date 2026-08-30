import { useState, useEffect, useRef } from "react";

function normalize(str) { return (str || "").trim().toLowerCase(); }

export default function QuickAddCustomer({ existingCustomers, onCreated, onClose }) {
  const [form, setForm] = useState({ name: "", phone: "", mobile: "", email: "", address: "", state: "", pin: "", gstNumber: "", notes: "" });
  const [error, setError] = useState(null);
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [saving, setSaving] = useState(false);
  const nameRef = useRef(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  useEffect(() => {
    if (!existingCustomers) return;
    const name = normalize(form.name);
    const phone = normalize(form.phone) || normalize(form.mobile);
    const gstin = normalize(form.gstNumber);
    let match = null;
    if (gstin && gstin.length >= 15) {
      match = existingCustomers.find(c => normalize(c.gstNumber) === gstin);
    }
    if (!match && phone && phone.length >= 6) {
      match = existingCustomers.find(c => normalize(c.phone) === phone || normalize(c.mobile) === phone);
    }
    if (!match && name && name.length >= 3) {
      match = existingCustomers.find(c => normalize(c.name) === name);
    }
    setDuplicateWarning(match ? `Customer may already exist: "${match.name}"${match.gstNumber ? ` (GSTIN: ${match.gstNumber})` : ""}` : null);
  }, [form.name, form.phone, form.mobile, form.gstNumber, existingCustomers]);

  const validate = () => {
    if (!form.name.trim()) return "Customer name is required";
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return "Invalid email format";
    if (form.gstNumber && form.gstNumber.length !== 15) return "GSTIN must be 15 characters";
    return null;
  };

  const save = async () => {
    const v = validate();
    if (v) { setError(v); return; }
    setSaving(true); setError(null);
    try {
      const payload = { name: form.name.trim() };
      if (form.phone) payload.phone = form.phone.trim();
      if (form.mobile) payload.mobile = form.mobile.trim();
      if (form.email) payload.email = form.email.trim();
      if (form.address) payload.address = form.address.trim();
      if (form.state) payload.state = form.state.trim();
      if (form.pin) payload.pin = form.pin.trim();
      if (form.gstNumber) payload.gstNumber = form.gstNumber.trim();
      if (form.notes) payload.notes = form.notes.trim();
      const res = await fetch("/api/v1/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed to create customer");
      onCreated(data);
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  const handleKey = (e) => { if (e.key === "Escape") onClose(); if (e.key === "Enter" && e.ctrlKey) save(); };

  return (
    <div className="modal-overlay" onClick={onClose} onKeyDown={handleKey}>
      <div className="modal-content quick-add-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Quick Add Customer</h3>
          <button className="btn btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {duplicateWarning && <div className="warning-msg">{duplicateWarning}</div>}
          {error && <div className="error-msg">{error}</div>}

          <div className="form-row">
            <div className="form-group"><label>Customer Name *</label><input ref={nameRef} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Acme Corp" /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Phone</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Landline" /></div>
            <div className="form-group"><label>Mobile</label><input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} placeholder="Mobile number" /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Email</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" /></div>
            <div className="form-group"><label>GSTIN (optional)</label><input value={form.gstNumber} onChange={(e) => setForm({ ...form, gstNumber: e.target.value })} placeholder="15-digit GSTIN" maxLength={15} /></div>
          </div>
          <div className="form-group"><label>Address</label><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Full address" /></div>
          <div className="form-row">
            <div className="form-group"><label>State</label><input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} placeholder="e.g. Maharashtra" /></div>
            <div className="form-group"><label>PIN</label><input value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} placeholder="PIN code" maxLength={6} /></div>
          </div>
          <div className="form-group"><label>Notes</label><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes" /></div>

          <div className="quick-add-actions">
            <button className="btn btn-primary" onClick={save} disabled={saving || !form.name.trim()}>{saving ? "Saving…" : "Save Customer"}</button>
            <button className="btn" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
