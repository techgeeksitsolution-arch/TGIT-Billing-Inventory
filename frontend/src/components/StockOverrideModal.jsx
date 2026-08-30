import { useState, useRef, useEffect } from "react";

export default function StockOverrideModal({ stockWarnings, onConfirm, onCancel }) {
  const [reason, setReason] = useState("Sold before purchase entry");
  const reasonRef = useRef(null);

  useEffect(() => { reasonRef.current?.focus(); }, []);

  const totalShortage = stockWarnings.reduce((sum, w) => sum + (w.requested - w.available), 0);

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content stock-override-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ color: "#c0392b" }}>Insufficient Stock</h3>
          <button className="btn btn-sm" onClick={onCancel}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ marginBottom: 12, color: "#4a5568" }}>The following items have insufficient stock:</p>

          <table className="data-table" style={{ marginBottom: 16 }}>
            <thead>
              <tr><th>Product</th><th>Available</th><th>Required</th><th>Shortage</th></tr>
            </thead>
            <tbody>
              {stockWarnings.map((w) => (
                <tr key={w.productId}>
                  <td>{w.productName}</td>
                  <td>{w.available}</td>
                  <td>{w.requested}</td>
                  <td style={{ color: "#c0392b", fontWeight: 700 }}>{w.requested - w.available}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ background: "#fff5f5", border: "1px solid #fecaca", borderRadius: 8, padding: 12, marginBottom: 16 }}>
            <p style={{ margin: 0, color: "#9b2c2c", fontWeight: 600 }}>
              Total Shortage: {totalShortage} units
            </p>
            <p style={{ margin: "6px 0 0", color: "#9b2c2c", fontSize: "0.85rem" }}>
              This will create a negative stock balance. Only proceed if you are sure.
            </p>
          </div>

          <div className="form-group" style={{ marginBottom: 16 }}>
            <label>Reason for Override *</label>
            <input ref={reasonRef} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Sold before purchase entry" style={{ width: "100%", boxSizing: "border-box" }} />
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn" onClick={onCancel}>Cancel</button>
            <button className="btn btn-danger" onClick={() => onConfirm(reason)} disabled={!reason.trim()}>Generate Bill Anyway</button>
          </div>
        </div>
      </div>
    </div>
  );
}
