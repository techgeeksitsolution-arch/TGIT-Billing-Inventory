import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, NavLink, Navigate } from "react-router-dom";
import "./styles.css";
import { Dashboard } from "./components/Dashboard";
import { SalesList } from "./components/SalesList";
import { SalesForm } from "./components/SalesForm";
import { InvoicePreview } from "./components/InvoicePreview";
import { QuotationList } from "./components/QuotationList";
import { QuotationForm } from "./components/QuotationForm";
import { QuotationPreview } from "./components/QuotationPreview";
import { CustomerList } from "./components/CustomerList";
import { ProductList } from "./components/ProductList";
import { ServiceList } from "./components/ServiceList";
import { Settings } from "./components/Settings";

function App() {
  return (
    <BrowserRouter>
      <div className="app-layout">
        <nav className="sidebar">
          <div className="sidebar-brand">
            <img src="/TGIT.png" alt="TGIT" className="brand-logo" onError={(e) => { e.target.style.display = "none"; }} />
            <h2>TGIT Billing</h2>
          </div>
          <div className="nav-links">
            <NavLink to="/dashboard" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
              <span className="nav-icon">&#9632;</span> Dashboard
            </NavLink>
            <div className="nav-divider">Billing</div>
            <NavLink to="/sales" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
              <span className="nav-icon">&#128196;</span> Sales Invoices
            </NavLink>
            <NavLink to="/quotations" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
              <span className="nav-icon">&#128196;</span> Quotations
            </NavLink>
            <div className="nav-divider">Master Data</div>
            <NavLink to="/customers" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
              <span className="nav-icon">&#128101;</span> Customers
            </NavLink>
            <NavLink to="/products" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
              <span className="nav-icon">&#128230;</span> Products
            </NavLink>
            <NavLink to="/services" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
              <span className="nav-icon">&#9881;</span> Services
            </NavLink>
            <div className="nav-divider">System</div>
            <NavLink to="/settings" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
              <span className="nav-icon">&#9881;</span> Settings
            </NavLink>
          </div>
        </nav>
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/sales" element={<SalesList />} />
            <Route path="/sales/new" element={<SalesForm />} />
            <Route path="/sales/:id" element={<InvoicePreview />} />
            <Route path="/sales/:id/edit" element={<SalesForm />} />
            <Route path="/quotations" element={<QuotationList />} />
            <Route path="/quotations/new" element={<QuotationForm />} />
            <Route path="/quotations/:id" element={<QuotationPreview />} />
            <Route path="/quotations/:id/edit" element={<QuotationForm />} />
            <Route path="/customers" element={<CustomerList />} />
            <Route path="/products" element={<ProductList />} />
            <Route path="/services" element={<ServiceList />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;

ReactDOM.createRoot(document.getElementById("root")).render(<App />);