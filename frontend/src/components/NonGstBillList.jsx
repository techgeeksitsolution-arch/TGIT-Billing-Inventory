import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const STATUS_LABELS = {
  DRAFT: { label: "Draft", color: "#f0ad4e" },
  CONFIRMED: { label: "Finalized", color: "#5cb85c" },
  CANCELLED: { label: "Cancelled", color: "#d9534f" },
};

export function NonGstBillList() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    const query = `?page=${page}&limit=20${status ? `&status=${status}` : ""}${search ? `&search=${encodeURIComponent(search)}` : ""}`;
    fetch(`/api/v1/nongst${query}`)
      .then(r => r.json())
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [page, status, search]);

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Non-GST Bills</h1>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={() => navigate("/nongst/new")}>
            + New Non-GST Bill
          </button>
        </div>
      </div>

      <div className="filters">
        <form onSubmit={handleSearch} className="search-form">
          <input
            type="text"
            placeholder="Search by bill number or customer..."
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
                  <th>Bill #</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data?.items?.length === 0 && (
                  <tr><td colSpan="6" className="empty-state">No bills found</td></tr>
                )}
                {data?.items?.map((b) => (
                  <tr key={b.id}>
                    <td className="mono">{b.billNumber}</td>
                    <td>{new Date(b.billDate).toLocaleDateString("en-IN")}</td>
                    <td>{b.customerName || "N/A"}</td>
                    <td className="amount">₹{Number(b.grandTotal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                    <td>
                      <span className="status-badge" style={{ backgroundColor: STATUS_LABELS[b.status]?.color || "#999" }}>
                        {STATUS_LABELS[b.status]?.label || b.status}
                      </span>
                    </td>
                    <td className="actions-cell">
                      <button className="btn btn-sm btn-outline" onClick={() => navigate(`/nongst/${b.id}`)}>View</button>
                      {b.status === "DRAFT" && (
                        <button className="btn btn-sm btn-outline" onClick={() => navigate(`/nongst/${b.id}/edit`)}>Edit</button>
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
