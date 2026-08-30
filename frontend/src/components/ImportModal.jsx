import { useState, useRef, useEffect } from "react";

const ENDPOINTS = {
  sales: { import: "/api/v1/sales/import", confirm: "/api/v1/sales/import/confirm", template: "/api/v1/sales/template", export: "/api/v1/sales/export", invLabel: "Invoice No", partyLabel: "Customer", rateLabel: "Rate" },
  purchases: { import: "/api/v1/purchases/import", confirm: "/api/v1/purchases/import/confirm", template: "/api/v1/purchases/template", export: "/api/v1/purchases/export", invLabel: "Supplier Invoice No", partyLabel: "Supplier", rateLabel: "Unit Price" },
};

export default function ImportModal({ type, onClose, onImported }) {
  const cfg = ENDPOINTS[type];
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  const [products, setProducts] = useState([]);
  const [overrides, setOverrides] = useState({});
  const fileRef = useRef(null);

  useEffect(() => {
    if (type === "purchases") fetch("/api/v1/products").then((r) => r.json()).then(setProducts).catch(() => {});
  }, [type]);

  const handleFile = (e) => {
    setFile(e.target.files?.[0] || null);
    setResult(null); setError(null); setDone(null); setOverrides({});
  };

  const upload = async () => {
    if (!file) return;
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(cfg.import, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Upload failed");
      setResult(data);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const pendingRows = (result?.rows || []).filter((r) => r.needsReview && !overrides[r.row]);
  const canConfirm = result && (!result.hasErrors || pendingRows.length === 0);

  const confirmImport = async () => {
    if (!canConfirm) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(cfg.confirm, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batchId: result.batchId, productOverrides: overrides }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Import failed");
      setDone(data);
      onImported && onImported();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const doExport = () => { window.open(cfg.export, "_blank"); };
  const doTemplate = () => { window.open(cfg.template, "_blank"); };

  const rows = result?.rows || [];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 900 }}>
        <div className="modal-header">
          <h3>Import {type === "sales" ? "Sales" : "Purchases"} from Excel</h3>
          <button className="btn btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <button className="btn btn-outline" onClick={doTemplate}>Download Template</button>
            <button className="btn btn-outline" onClick={doExport}>Export Existing</button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} style={{ display: "none" }} />
            <button className="btn btn-outline" onClick={() => fileRef.current?.click()}>Choose File</button>
            <span style={{ alignSelf: "center" }}>{file ? file.name : "No file selected"}</span>
            <button className="btn btn-primary" onClick={upload} disabled={!file || busy}>{busy ? "Processing…" : "Validate"}</button>
          </div>

          {error && <p className="error-msg">{error}</p>}
          {done && <p className="success-msg">Imported {done.created} record(s): {done.invoices.join(", ")}</p>}

          {result && (
            <>
              <div className="import-summary">
                <span>Total rows: <b>{result.totalRows}</b></span>
                <span>Valid invoices: <b>{result.validGroups}</b></span>
                {result.hasErrors && !canConfirm && <span className="error-msg" style={{ display: "inline" }}>Resolve product matches below before importing.</span>}
              </div>

              {type === "purchases" && pendingRows.length > 0 && (
                <div className="review-match-box">
                  <h4>Review Product Matches ({pendingRows.length})</h4>
                  {pendingRows.map((r) => (
                    <div className="form-row" key={r.row} style={{ marginBottom: 6 }}>
                      <span style={{ minWidth: 220 }}>Row {r.row}: {r.description || r.supplierInvoiceNo}</span>
                      <select value={overrides[r.row] || ""} onChange={(e) => setOverrides({ ...overrides, [r.row]: e.target.value })}>
                        <option value="">Select product…</option>
                        {products.map((p) => <option key={p.id} value={p.id}>{p.name}{p.hsnCode ? ` (${p.hsnCode})` : ""}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ maxHeight: 320, overflow: "auto" }}>
                <table className="data-table">
                  <thead>
                    <tr><th>Row</th><th>{cfg.invLabel}</th><th>Date</th><th>{cfg.partyLabel}</th><th>Description</th><th>Product</th><th>Qty</th><th>{cfg.rateLabel}</th><th>Errors</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.row} className={r.errors?.length ? "row-error" : ""}>
                        <td>{r.row}</td>
                        <td>{r.invoiceNo || r.supplierInvoiceNo || "—"}</td>
                        <td>{r.date || "—"}</td>
                        <td>{r.customer || r.supplier || "—"}</td>
                        <td>{r.description || "—"}</td>
                        <td>{r.productMatched ? (r.productName || "✓") : <span className="muted">needs match</span>}</td>
                        <td>{r.quantity ?? "—"}</td>
                        <td>{r.rate ?? r.unitPrice ?? "—"}</td>
                        <td>{r.errors?.length ? r.errors.join("; ") : "✓"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 12, textAlign: "right" }}>
                <button className="btn btn-primary" onClick={confirmImport} disabled={!canConfirm || busy || done}>{busy ? "Importing…" : "Import Valid Records"}</button>
              </div>
            </>
          )}
          <p className="import-note">
            Matching: Product by HSN/SAC then Description (must already exist). {cfg.partyLabel} is auto-created if not found.
            Draft records are created; finalize individually to affect stock.
          </p>
        </div>
      </div>
    </div>
  );
}
