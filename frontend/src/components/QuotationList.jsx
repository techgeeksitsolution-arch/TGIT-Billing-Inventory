import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useFetch } from "../api";
import { useDeleteDocument } from "../lib/useDeleteDocument.js";

const STATUS_LABELS = {
  DRAFT: { label: "Draft", color: "#f0ad4e" },
  CONFIRMED: { label: "Confirmed", color: "#5cb85c" },
  CANCELLED: { label: "Cancelled", color: "#d9534f" },
};

export function QuotationList() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const query = `?page=${page}&limit=20${status ? `&status=${status}` : ""}${search ? `&search=${encodeURIComponent(search)}` : ""}`;
  const { data, loading, error, refetch } = useFetch(`/quotations${query}`);
  const del = useDeleteDocument({ basePath: "/quotations", label: "quotation", onDeleted: refetch });

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Quotations</h1>
        <button className="btn btn-primary" onClick={() => navigate("/quotations/new")}>
          + New Quotation
        </button>
      </div>

      {del.message && (
        <div className={del.message.type === "success" ? "success-msg" : "error-msg"} onClick={del.clearMessage}>
          {del.message.text}
        </div>
      )}

      <div className="filters">
        <form onSubmit={handleSearch} className="search-form">
          <input
            type="text"
            placeholder="Search by quotation number or customer..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="search-input"
          />
          <button type="submit" className="btn btn-sm">Search</button>
        </form>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="filter-select">
          <option value="">All Status</option>
          <option value="DRAFT">Draft</option>
          <option value="CONFIRMED">Confirmed</option>
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
                  <th>Quotation #</th>
                  <th>Date</th>
                  <th>Valid Until</th>
                  <th>Customer</th>
                  <th>Tax Mode</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data?.items?.length === 0 && (
                  <tr><td colSpan="8" className="empty-state">No quotations found</td></tr>
                )}
                {data?.items?.map((q) => (
                  <tr key={q.id}>
                    <td className="mono">{q.quotationNumber}</td>
                    <td>{new Date(q.quotationDate).toLocaleDateString("en-IN")}</td>
                    <td>{new Date(q.validUntil).toLocaleDateString("en-IN")}</td>
                    <td>{q.customerName || "N/A"}</td>
                    <td>{q.taxMode.replace(/_/g, " ")}</td>
                    <td className="amount">₹{Number(q.grandTotal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                    <td>
                      <span className="status-badge" style={{ backgroundColor: STATUS_LABELS[q.status]?.color || "#999" }}>
                        {STATUS_LABELS[q.status]?.label || q.status}
                      </span>
                    </td>
                    <td className="actions-cell">
                      <button className="btn btn-sm btn-outline" onClick={() => navigate(`/quotations/${q.id}`)}>View</button>
                      {q.status === "DRAFT" && (
                        <button className="btn btn-sm btn-outline" onClick={() => navigate(`/quotations/${q.id}/edit`)}>Edit</button>
                      )}
                      {!q.convertedInvoiceId && (
                        <button
                          className="btn btn-sm btn-danger"
                          disabled={del.isDeleting(q.id)}
                          onClick={() => del.remove(q.id, q.quotationNumber)}
                        >
                          {del.isDeleting(q.id) ? "Deleting..." : "Delete"}
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
