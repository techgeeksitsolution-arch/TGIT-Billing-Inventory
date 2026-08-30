import { useEffect, useState } from "react";
import PurchaseForm from "./PurchaseForm.jsx";
import PurchasePreview from "./PurchasePreview.jsx";
import ImportModal from "./ImportModal.jsx";
import { apiGet } from "../api";
import { useDeleteDocument } from "../lib/useDeleteDocument.js";

export function PurchaseList() {
  const [view, setView] = useState("list");
  const [pid, setPid] = useState(null);
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showImport, setShowImport] = useState(false);

  const [loadError, setLoadError] = useState(null);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    const q = [];
    if (search) q.push(`search=${encodeURIComponent(search)}`);
    if (statusFilter) q.push(`status=${statusFilter}`);
    try {
      const data = await apiGet(`/purchases${q.length ? "?" + q.join("&") : ""}`);
      setPurchases(data.items || []);
    } catch (e) {
      setPurchases([]);
      setLoadError(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const del = useDeleteDocument({ basePath: "/purchases", label: "purchase", onDeleted: load });

  if (view === "form") return <PurchaseForm purchaseId={pid} onSaved={(id) => { if (id) { setPid(id); setView("preview"); } else setView("list"); }} />;
  if (view === "preview") return <PurchasePreview purchaseId={pid} onBack={() => { setView("list"); load(); }} onEdit={(id) => { setPid(id); setView("form"); }} onChanged={() => load()} />;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Purchases</h1>
        <div className="header-actions">
          <button className="btn btn-outline" onClick={() => setShowImport(true)}>Import / Export</button>
          <button className="btn btn-primary" onClick={() => { setPid(null); setView("form"); }}>New Purchase</button>
        </div>
      </div>

      {showImport && <ImportModal type="purchases" onClose={() => setShowImport(false)} onImported={() => load()} />}

      {del.message && (
        <div className={del.message.type === "success" ? "success-msg" : "error-msg"} onClick={del.clearMessage}>
          {del.message.text}
        </div>
      )}
      {loadError && <div className="error-msg">Unable to load purchases — {loadError}</div>}

      <div className="filters">
        <input className="search-input" placeholder="Search invoice / supplier" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} />
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); }}>
          <option value="">All</option>
          <option value="DRAFT">Draft</option>
          <option value="CONFIRMED">Finalized</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>
      {loading ? <p>Loading…</p> : (
        <table className="data-table">
          <thead><tr><th>Internal No</th><th>Supplier Invoice</th><th>Supplier</th><th>Date</th><th>Status</th><th>Payment</th><th>Total</th><th></th></tr></thead>
          <tbody>
            {purchases.length === 0 && <tr><td colSpan={8}>No purchases found.</td></tr>}
            {purchases.map((p) => (
              <tr key={p.id} onClick={() => { setPid(p.id); setView("preview"); }} style={{ cursor: "pointer" }}>
                <td>{p.internalNumber}</td>
                <td>{p.supplierInvoiceNo || "—"}</td>
                <td>{p.supplier?.name || "—"}</td>
                <td>{new Date(p.invoiceDate).toLocaleDateString()}</td>
                <td>{p.status}</td>
                <td><span className={`badge ${(p.paymentStatus || "UNPAID").toLowerCase()}`}>{p.paymentStatus || "UNPAID"}</span></td>
                <td>{Number(p.grandTotal).toFixed(2)}</td>
                <td className="actions-cell" onClick={(e) => e.stopPropagation()}>
                  <button className="btn btn-sm" onClick={() => { setPid(p.id); setView("preview"); }}>View</button>
                  {p.status === "DRAFT" && (
                    <button
                      className="btn btn-sm btn-danger"
                      disabled={del.isDeleting(p.id)}
                      onClick={() => del.remove(p.id, p.internalNumber)}
                      title="Delete this draft purchase"
                    >
                      {del.isDeleting(p.id) ? "Deleting..." : "Delete"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
