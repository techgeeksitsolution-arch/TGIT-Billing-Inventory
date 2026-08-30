import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useFetch } from "../api";
import { useDeleteDocument } from "../lib/useDeleteDocument.js";
import ImportModal from "./ImportModal.jsx";
import { formatDate } from "../lib/format.js";

const STATUS_LABELS = {
  DRAFT: { label: "Draft", color: "#f0ad4e" },
  CONFIRMED: { label: "Finalized", color: "#5cb85c" },
  CANCELLED: { label: "Cancelled", color: "#d9534f" },
};

export function SalesList() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [showImport, setShowImport] = useState(false);

  const query = `?page=${page}&limit=20${status ? `&status=${status}` : ""}${search ? `&search=${encodeURIComponent(search)}` : ""}`;
  const { data, loading, error, refetch } = useFetch(`/sales${query}`);
  const del = useDeleteDocument({ basePath: "/sales", label: "invoice", onDeleted: refetch });

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Sales Invoices</h1>
        <div className="header-actions">
          <button className="btn btn-outline" onClick={() => setShowImport(true)}>Import / Export</button>
          <button className="btn btn-primary" onClick={() => navigate("/sales/new")}>
            + New Invoice
          </button>
        </div>
      </div>

      {showImport && <ImportModal type="sales" onClose={() => setShowImport(false)} onImported={() => refetch && refetch()} />}

      {del.message && (
        <div className={del.message.type === "success" ? "success-msg" : "error-msg"} onClick={del.clearMessage}>
          {del.message.text}
        </div>
      )}

      <div className="filters">
        <form onSubmit={handleSearch} className="search-form">
          <input
            type="text"
            placeholder="Search by invoice number or customer..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="search-input"
          />
          <button type="submit" className="btn btn-sm">Search</button>
        </form>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="filter-select">
          <option value="">All Status</option>
          <option value="DRAFT">Draft</option>
          <option value="CONFIRMED">Finalized</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      {loading && <div className="loading">Loading...</div>}
      {error && <div className="error-msg">{error}</div>}

      {!loading && !error && (
        <>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Tax Mode</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data?.items?.length === 0 && (
                  <tr><td colSpan="7" className="empty-state">No invoices found</td></tr>
                )}
                {data?.items?.map((inv) => (
                  <tr key={inv.id}>
                    <td className="mono">{inv.invoiceNumber}</td>
                    <td>{formatDate(inv.invoiceDate)}</td>
                    <td>{inv.customer?.name || "N/A"}</td>
                    <td>{inv.taxMode.replace(/_/g, " ")}</td>
                    <td className="amount">₹{Number(inv.grandTotal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                    <td>
                      <span className="status-badge" style={{ backgroundColor: STATUS_LABELS[inv.status]?.color || "#999" }}>
                        {STATUS_LABELS[inv.status]?.label || inv.status}
                      </span>
                    </td>
                    <td className="actions-cell">
                      <button className="btn btn-sm btn-outline" onClick={() => navigate(`/sales/${inv.id}`)}>View</button>
                      {inv.status === "DRAFT" && (
                        <button className="btn btn-sm btn-outline" onClick={() => navigate(`/sales/${inv.id}/edit`)}>Edit</button>
                      )}
                      {inv.status === "DRAFT" && (
                        <button
                          className="btn btn-sm btn-danger"
                          disabled={del.isDeleting(inv.id)}
                          onClick={() => del.remove(inv.id, inv.invoiceNumber)}
                        >
                          {del.isDeleting(inv.id) ? "Deleting..." : "Delete"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data?.totalPages > 1 && (
            <div className="pagination">
              <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
              <span>Page {data.page} of {data.totalPages}</span>
              <button className="btn btn-sm" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
