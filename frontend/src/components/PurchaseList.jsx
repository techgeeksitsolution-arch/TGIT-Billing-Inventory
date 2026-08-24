import { useEffect, useState } from "react";
import PurchaseForm from "./PurchaseForm.jsx";
import PurchasePreview from "./PurchasePreview.jsx";

export function PurchaseList() {
  const [view, setView] = useState("list");
  const [pid, setPid] = useState(null);
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const load = async () => {
    setLoading(true);
    const q = [];
    if (search) q.push(`search=${encodeURIComponent(search)}`);
    if (statusFilter) q.push(`status=${statusFilter}`);
    const res = await fetch(`/api/v1/purchases${q.length ? "?" + q.join("&") : ""}`);
    const data = await res.json();
    setPurchases(data.items || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  if (view === "form") return <PurchaseForm purchaseId={pid} onSaved={(id) => { if (id) { setPid(id); setView("preview"); } else setView("list"); }} />;
  if (view === "preview") return <PurchasePreview purchaseId={pid} onBack={() => { setView("list"); load(); }} onEdit={(id) => { setPid(id); setView("form"); }} onChanged={() => load()} />;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Purchases</h1>
        <button className="btn btn-primary" onClick={() => { setPid(null); setView("form"); }}>New Purchase</button>
      </div>
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
          <thead><tr><th>Internal No</th><th>Supplier Invoice</th><th>Supplier</th><th>Date</th><th>Status</th><th>Total</th><th></th></tr></thead>
          <tbody>
            {purchases.length === 0 && <tr><td colSpan={7}>No purchases found.</td></tr>}
            {purchases.map((p) => (
              <tr key={p.id} onClick={() => { setPid(p.id); setView("preview"); }} style={{ cursor: "pointer" }}>
                <td>{p.internalNumber}</td>
                <td>{p.supplierInvoiceNo || "—"}</td>
                <td>{p.supplier?.name || "—"}</td>
                <td>{new Date(p.invoiceDate).toLocaleDateString()}</td>
                <td>{p.status}</td>
                <td>{Number(p.grandTotal).toFixed(2)}</td>
                <td><button className="btn btn-sm">View</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
