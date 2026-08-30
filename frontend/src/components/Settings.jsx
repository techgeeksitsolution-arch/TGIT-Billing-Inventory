import { useState, useEffect } from "react";

export function Settings() {
  const [section, setSection] = useState("fy");
  const [fy, setFy] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const [profile, setProfile] = useState({
    name: "Tech Geeks IT Solution", gstin: "", udyam: "", address: "", phone: "", mobile: "",
    email: "", website: "", state: "", pin: "", bankName: "", branch: "", accountName: "",
    accountNumber: "", ifsc: "", upiId: "", invoiceFooter: "", invoiceNotes: "",
    logoBase64: "", salesPrefix: "TGIT", quotationPrefix: "TGIT/QUOT",
  });

  const [termType, setTermType] = useState("SALES");
  const [terms, setTerms] = useState([]);
  const [newTerm, setNewTerm] = useState("");
  const [editingTerm, setEditingTerm] = useState(null);
  const [logoFile, setLogoFile] = useState(null);

  const [ocrConfig, setOcrConfig] = useState({ provider: "", configured: false });
  const [ocrApiKey, setOcrApiKey] = useState("");
  const [ocrSaving, setOcrSaving] = useState(false);

  useEffect(() => {
    fetch("/api/v1/settings/financial-year").then(r => r.json()).then(d => { setFy(d.financialYear); }).catch(() => {});
    fetch("/api/v1/settings/company-profile").then(r => r.json()).then(d => setProfile(p => ({ ...p, ...d }))).catch(() => {});
    fetch("/api/v1/settings/ocr-config").then(r => r.json()).then(d => setOcrConfig({ provider: d.provider || "", configured: Boolean(d.configured) })).catch(() => {});
    loadTerms("SALES");
    setLoading(false);
    // eslint-disable-next-line
  }, []);

  const saveOcrConfig = async () => {
    setOcrSaving(true); setError(null); setMessage(null);
    try {
      const payload = { provider: ocrConfig.provider };
      if (ocrApiKey.trim()) payload.apiKey = ocrApiKey.trim();
      const res = await fetch("/api/v1/settings/ocr-config", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed");
      setOcrConfig({ provider: data.provider || "", configured: Boolean(data.configured) });
      setOcrApiKey("");
      setMessage("OCR configuration saved");
    } catch (e) { setError(e.message); } finally { setOcrSaving(false); }
  };

  const loadTerms = (type) => {
    fetch(`/api/v1/settings/terms?type=${type}`).then(r => r.json()).then(setTerms).catch(() => setTerms([]));
  };

  const handleSaveFy = async () => {
    setSaving(true); setError(null); setMessage(null);
    try {
      const res = await fetch("/api/v1/settings/financial-year", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ financialYear: fy }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed");
      setMessage(`Financial year updated to ${data.financialYear}`);
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  const handleSaveProfile = async () => {
    setSaving(true); setError(null); setMessage(null);
    try {
      const payload = { ...profile };
      if (logoFile) payload.logoBase64 = logoFile;
      const res = await fetch("/api/v1/settings/company-profile", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed");
      setProfile(data);
      setLogoFile(null);
      setMessage("Company profile saved");
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  const onLogoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setLogoFile(reader.result);
    reader.readAsDataURL(file);
  };

  const addTerm = async () => {
    if (!newTerm.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/v1/settings/terms", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ termType, text: newTerm.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed");
      setNewTerm("");
      loadTerms(termType);
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  const updateTerm = async (id, patch) => {
    const res = await fetch(`/api/v1/settings/terms/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) loadTerms(termType);
  };

  const deleteTerm = async (id) => {
    const res = await fetch(`/api/v1/settings/terms/${id}`, { method: "DELETE" });
    if (res.ok) loadTerms(termType);
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Settings</h1>
      </div>

      {message && <div className="success-msg">{message}</div>}
      {error && <div className="error-msg">{error}</div>}

      <div className="settings-tabs">
        <button className={section === "fy" ? "tab active" : "tab"} onClick={() => setSection("fy")}>Financial Year</button>
        <button className={section === "profile" ? "tab active" : "tab"} onClick={() => setSection("profile")}>Company Profile</button>
        <button className={section === "terms" ? "tab active" : "tab"} onClick={() => setSection("terms")}>Document Terms</button>
        <button className={section === "ocr" ? "tab active" : "tab"} onClick={() => setSection("ocr")}>OCR (Purchase)</button>
      </div>

      {section === "fy" && (
        <div className="form-card">
          <h3>Financial Year</h3>
          <p style={{ color: "#486581", fontSize: "0.88rem", marginBottom: 16 }}>
            Set the active financial year for document numbering. Existing documents retain their original numbers.
          </p>
          <div className="form-row">
            <div className="form-group" style={{ maxWidth: 200 }}>
              <label>Active Financial Year</label>
              <input type="text" value={fy} onChange={(e) => setFy(e.target.value)} placeholder="e.g. 26-27" maxLength={5} />
              <small style={{ color: "#718096", fontSize: "0.78rem" }}>Format: YY-YY (e.g. 26-27, 27-28)</small>
            </div>
          </div>
          <button className="btn btn-primary" onClick={handleSaveFy} disabled={saving}>Save</button>
          <div style={{ marginTop: 16 }}>
            <ul style={{ color: "#486581", fontSize: "0.88rem", lineHeight: 1.8, paddingLeft: 20 }}>
              <li>Sales invoices: <strong>TGIT/001/{fy || "YY-YY"}</strong></li>
              <li>Quotations: <strong>TGIT/QUOT/001/{fy || "YY-YY"}</strong></li>
              <li>Sales and Quotation numbering sequences are independent</li>
              <li>Changing the financial year starts new sequences from 001</li>
            </ul>
          </div>
        </div>
      )}

      {section === "profile" && (
        <div className="form-card">
          <h3>Company Profile</h3>
          <div className="form-row">
            <div className="form-group" style={{ maxWidth: 280 }}>
              <label>Company Logo</label>
              {(logoFile || profile.logoBase64) && (
                <img src={logoFile || profile.logoBase64} alt="logo" style={{ maxHeight: 80, marginBottom: 8, display: "block" }} />
              )}
              <input type="file" accept="image/*" onChange={onLogoChange} />
              <small style={{ color: "#718096", fontSize: "0.78rem" }}>PNG/JPG. Stored and shown on invoices.</small>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Company Name</label><input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></div>
            <div className="form-group"><label>GSTIN</label><input value={profile.gstin || ""} onChange={(e) => setProfile({ ...profile, gstin: e.target.value })} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>UDYAM / MSME No.</label><input value={profile.udyam || ""} onChange={(e) => setProfile({ ...profile, udyam: e.target.value })} /></div>
            <div className="form-group"><label>State</label><input value={profile.state || ""} onChange={(e) => setProfile({ ...profile, state: e.target.value })} /></div>
          </div>
          <div className="form-group"><label>Address</label><input value={profile.address || ""} onChange={(e) => setProfile({ ...profile, address: e.target.value })} /></div>
          <div className="form-row">
            <div className="form-group"><label>Phone</label><input value={profile.phone || ""} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} /></div>
            <div className="form-group"><label>Mobile</label><input value={profile.mobile || ""} onChange={(e) => setProfile({ ...profile, mobile: e.target.value })} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Email</label><input value={profile.email || ""} onChange={(e) => setProfile({ ...profile, email: e.target.value })} /></div>
            <div className="form-group"><label>Website</label><input value={profile.website || ""} onChange={(e) => setProfile({ ...profile, website: e.target.value })} /></div>
            <div className="form-group"><label>PIN</label><input value={profile.pin || ""} onChange={(e) => setProfile({ ...profile, pin: e.target.value })} /></div>
          </div>
          <h4 style={{ marginTop: 16 }}>Bank Details</h4>
          <div className="form-row">
            <div className="form-group"><label>Bank Name</label><input value={profile.bankName || ""} onChange={(e) => setProfile({ ...profile, bankName: e.target.value })} /></div>
            <div className="form-group"><label>Branch</label><input value={profile.branch || ""} onChange={(e) => setProfile({ ...profile, branch: e.target.value })} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Account Name</label><input value={profile.accountName || ""} onChange={(e) => setProfile({ ...profile, accountName: e.target.value })} /></div>
            <div className="form-group"><label>Account Number</label><input value={profile.accountNumber || ""} onChange={(e) => setProfile({ ...profile, accountNumber: e.target.value })} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>IFSC</label><input value={profile.ifsc || ""} onChange={(e) => setProfile({ ...profile, ifsc: e.target.value })} /></div>
            <div className="form-group"><label>UPI ID</label><input value={profile.upiId || ""} onChange={(e) => setProfile({ ...profile, upiId: e.target.value })} /></div>
          </div>
          <div className="form-group"><label>Invoice Footer</label><textarea rows={2} value={profile.invoiceFooter || ""} onChange={(e) => setProfile({ ...profile, invoiceFooter: e.target.value })} /></div>
          <div className="form-group"><label>Invoice Notes</label><textarea rows={2} value={profile.invoiceNotes || ""} onChange={(e) => setProfile({ ...profile, invoiceNotes: e.target.value })} /></div>
          <h4 style={{ marginTop: 16 }}>Document Number Prefixes</h4>
          <div className="form-row">
            <div className="form-group"><label>Sales Invoice Prefix</label><input value={profile.salesPrefix || "TGIT"} onChange={(e) => setProfile({ ...profile, salesPrefix: e.target.value })} placeholder="TGIT" /></div>
            <div className="form-group"><label>Quotation Prefix</label><input value={profile.quotationPrefix || "TGIT/QUOT"} onChange={(e) => setProfile({ ...profile, quotationPrefix: e.target.value })} placeholder="TGIT/QUOT" /></div>
            <div className="form-group"><label>Purchase Prefix</label><input value={profile.purchasePrefix || "TGIT/P"} onChange={(e) => setProfile({ ...profile, purchasePrefix: e.target.value })} placeholder="TGIT/P" /></div>
            <div className="form-group"><label>Non-GST Bill Prefix</label><input value={profile.nonGstPrefix || "TGIT/NG"} onChange={(e) => setProfile({ ...profile, nonGstPrefix: e.target.value })} placeholder="TGIT/NG" /></div>
          </div>
          <button className="btn btn-primary" onClick={handleSaveProfile} disabled={saving}>Save Profile</button>
        </div>
      )}

      {section === "terms" && (
        <div className="form-card">
          <h3>Document Terms &amp; Conditions</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Term Type</label>
              <select value={termType} onChange={(e) => { setTermType(e.target.value); loadTerms(e.target.value); }}>
                <option value="SALES">Sales Invoice Terms</option>
                <option value="QUOTATION">Quotation Terms</option>
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input className="search-input" placeholder="Add a new term..." value={newTerm} onChange={(e) => setNewTerm(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTerm()} />
            <button className="btn btn-primary" onClick={addTerm} disabled={saving}>+ Add</button>
          </div>
          <ul className="terms-list">
            {terms.length === 0 && <li className="empty-state">No terms yet. Add the first one.</li>}
            {terms.map((t) => (
              <li key={t.id} className="term-item">
                {editingTerm?.id === t.id ? (
                  <input value={editingTerm.text} onChange={(e) => setEditingTerm({ ...editingTerm, text: e.target.value })} style={{ flex: 1 }} />
                ) : (
                  <span style={{ flex: 1, textDecoration: t.isEnabled ? "none" : "line-through", opacity: t.isEnabled ? 1 : 0.5 }}>{t.text}</span>
                )}
                {editingTerm?.id === t.id ? (
                  <button className="btn btn-sm btn-primary" onClick={() => { updateTerm(t.id, { text: editingTerm.text }); setEditingTerm(null); }}>Save</button>
                ) : (
                  <>
                    <button className="btn btn-sm btn-outline" onClick={() => setEditingTerm({ id: t.id, text: t.text })}>Edit</button>
                    <button className="btn btn-sm btn-outline" onClick={() => updateTerm(t.id, { isEnabled: !t.isEnabled })}>{t.isEnabled ? "Disable" : "Enable"}</button>
                    <button className="btn btn-sm btn-danger" onClick={() => deleteTerm(t.id)}>Delete</button>
                  </>
                )}
              </li>
            ))}
          </ul>
          <p style={{ color: "#718096", fontSize: "0.8rem", marginTop: 8 }}>Enabled terms are automatically shown on the matching document. Disabled terms are hidden.</p>
        </div>
      )}

      {section === "ocr" && (
        <div className="form-card">
          <h3>Purchase Invoice OCR</h3>
          <p style={{ color: "#486581", fontSize: "0.88rem", marginBottom: 16 }}>
            Configure an OCR provider to extract data from uploaded purchase invoices. The API key is stored securely and never returned to the browser.
          </p>
          <div className="form-row">
            <div className="form-group" style={{ maxWidth: 240 }}>
              <label>Provider</label>
              <select value={ocrConfig.provider} onChange={(e) => setOcrConfig({ ...ocrConfig, provider: e.target.value })}>
                <option value="">Not configured</option>
                <option value="GOOGLE_VISION">Google Vision</option>
                <option value="AZURE_FORM">Azure Form Recognizer</option>
                <option value="TESSERACT">Tesseract (local)</option>
              </select>
            </div>
            <div className="form-group" style={{ maxWidth: 320 }}>
              <label>API Key {ocrConfig.configured && <span className="muted">(already set)</span>}</label>
              <input type="password" value={ocrApiKey} onChange={(e) => setOcrApiKey(e.target.value)} placeholder={ocrConfig.configured ? "Leave blank to keep existing" : "Enter API key"} />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <span className={`badge ${ocrConfig.configured ? "active" : "inactive"}`}>{ocrConfig.configured ? "Configured" : "Not Configured"}</span>
          </div>
          <button className="btn btn-primary" onClick={saveOcrConfig} disabled={ocrSaving || !ocrConfig.provider}>Save OCR Config</button>
        </div>
      )}
    </div>
  );
}
