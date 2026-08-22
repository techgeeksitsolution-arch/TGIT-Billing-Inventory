import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

export function Dashboard() {
  const navigate = useNavigate();
  const [fy, setFy] = useState("");
  const [salesCount, setSalesCount] = useState(0);
  const [quotationCount, setQuotationCount] = useState(0);
  const [customerCount, setCustomerCount] = useState(0);
  const [productCount, setProductCount] = useState(0);
  const [recentSales, setRecentSales] = useState([]);
  const [recentQuotations, setRecentQuotations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/v1/settings/financial-year").then(r => r.json()),
      fetch("/api/v1/sales?limit=5").then(r => r.json()),
      fetch("/api/v1/quotations?limit=5").then(r => r.json()),
      fetch("/api/v1/customers").then(r => r.json()),
      fetch("/api/v1/products").then(r => r.json()),
    ]).then(([fyData, salesData, quotData, custs, prods]) => {
      setFy(fyData.financialYear);
      setSalesCount(salesData.total || 0);
      setRecentSales(salesData.items || []);
      setQuotationCount(quotData.total || 0);
      setRecentQuotations(quotData.items || []);
      setCustomerCount(custs.length || 0);
      setProductCount(prods.length || 0);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading dashboard...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Dashboard</h1>
        <span className="fy-badge">FY: {fy}</span>
      </div>

      <div className="stats-grid">
        <div className="stat-card" onClick={() => navigate("/sales")} style={{ cursor: "pointer" }}>
          <div className="stat-number">{salesCount}</div>
          <div className="stat-label">Sales Invoices</div>
        </div>
        <div className="stat-card" onClick={() => navigate("/quotations")} style={{ cursor: "pointer" }}>
          <div className="stat-number">{quotationCount}</div>
          <div className="stat-label">Quotations</div>
        </div>
        <div className="stat-card" onClick={() => navigate("/customers")} style={{ cursor: "pointer" }}>
          <div className="stat-number">{customerCount}</div>
          <div className="stat-label">Customers</div>
        </div>
        <div className="stat-card" onClick={() => navigate("/products")} style={{ cursor: "pointer" }}>
          <div className="stat-number">{productCount}</div>
          <div className="stat-label">Products</div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="form-card">
          <div className="section-header">
            <h3>Recent Sales</h3>
            <button className="btn btn-sm btn-outline" onClick={() => navigate("/sales")}>View All</button>
          </div>
          {recentSales.length === 0 && <p className="empty-hint">No invoices yet. Create your first invoice.</p>}
          {recentSales.map(inv => (
            <div key={inv.id} className="dash-list-item" onClick={() => navigate(`/sales/${inv.id}`)}>
              <div>
                <span className="mono">{inv.invoiceNumber}</span>
                <span className="dash-list-sub">{inv.customer?.name || "Walk-in"}</span>
              </div>
              <div className="dash-list-right">
                <span className="amount">₹{Number(inv.grandTotal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                <span className={`status-dot status-${inv.status.toLowerCase()}`}></span>
              </div>
            </div>
          ))}
        </div>

        <div className="form-card">
          <div className="section-header">
            <h3>Recent Quotations</h3>
            <button className="btn btn-sm btn-outline" onClick={() => navigate("/quotations")}>View All</button>
          </div>
          {recentQuotations.length === 0 && <p className="empty-hint">No quotations yet. Create your first quotation.</p>}
          {recentQuotations.map(q => (
            <div key={q.id} className="dash-list-item" onClick={() => navigate(`/quotations/${q.id}`)}>
              <div>
                <span className="mono">{q.quotationNumber}</span>
                <span className="dash-list-sub">{q.customerName || "Walk-in"}</span>
              </div>
              <div className="dash-list-right">
                <span className="amount">₹{Number(q.grandTotal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                <span className={`status-dot status-${q.status.toLowerCase()}`}></span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="quick-actions">
        <h3>Quick Actions</h3>
        <div className="actions-row">
          <button className="btn btn-primary" onClick={() => navigate("/sales/new")}>+ New Invoice</button>
          <button className="btn btn-primary" onClick={() => navigate("/quotations/new")}>+ New Quotation</button>
          <button className="btn btn-outline" onClick={() => navigate("/customers")}>Manage Customers</button>
          <button className="btn btn-outline" onClick={() => navigate("/products")}>Manage Products</button>
          <button className="btn btn-outline" onClick={() => navigate("/settings")}>Settings</button>
        </div>
      </div>
    </div>
  );
}
