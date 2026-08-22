import { useState, useEffect } from "react";

export function Settings() {
  const [financialYear, setFinancialYear] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch("/api/v1/settings/financial-year")
      .then(r => r.json())
      .then(data => { setFinancialYear(data.financialYear); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/v1/settings/financial-year", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ financialYear }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed to save");
      setMessage(`Financial year updated to ${data.financialYear}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Settings</h1>
      </div>

      <div className="form-card">
        <h3>Financial Year</h3>
        <p style={{ color: "#486581", fontSize: "0.88rem", marginBottom: 16 }}>
          Set the active financial year for document numbering. This affects the suffix on new sales invoices and quotations.
          Existing documents retain their original numbers.
        </p>

        {message && <div className="success-msg">{message}</div>}
        {error && <div className="error-msg">{error}</div>}

        <div className="form-row">
          <div className="form-group" style={{ maxWidth: 200 }}>
            <label>Active Financial Year</label>
            <input
              type="text"
              value={financialYear}
              onChange={(e) => setFinancialYear(e.target.value)}
              placeholder="e.g. 26-27"
              pattern="\d{2}-\d{2}"
              maxLength={5}
            />
            <small style={{ color: "#718096", fontSize: "0.78rem" }}>Format: YY-YY (e.g. 26-27, 27-28)</small>
          </div>
        </div>

        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      <div className="form-card">
        <h3>How it works</h3>
        <ul style={{ color: "#486581", fontSize: "0.88rem", lineHeight: 1.8, paddingLeft: 20 }}>
          <li>Sales invoices use format: <strong>TGIT/001/{financialYear || "YY-YY"}</strong></li>
          <li>Quotations use format: <strong>TGIT/QUOT/001/{financialYear || "YY-YY"}</strong></li>
          <li>Sales and Quotation numbering sequences are independent</li>
          <li>Changing the financial year starts new sequences from 001</li>
          <li>Previous-year documents retain their original numbers</li>
        </ul>
      </div>
    </div>
  );
}
