function statusColor(status) {
  if (status === "CONFIRMED") return "#5cb85c";
  if (status === "CANCELLED") return "#d9534f";
  return "#f0ad4e";
}

export function Letterhead({ profile, title, status, statusLabel }) {
  const p = profile || {};
  const details = [
    p.address && { label: "Address", value: p.address },
    p.state && { label: "State", value: p.state },
    p.pin && { label: "PIN", value: p.pin },
    p.phone && { label: "Phone", value: p.phone },
    p.mobile && { label: "Mobile", value: p.mobile },
    p.email && { label: "Email", value: p.email },
    p.website && { label: "Website", value: p.website },
    p.gstin && { label: "GSTIN", value: p.gstin },
    p.udyam && { label: "MSME / UDYAM", value: p.udyam },
  ].filter(Boolean);

  return (
    <div className="invoice-header-section">
      <div className="invoice-brand">
        {p.logoBase64 ? (
          <img src={p.logoBase64} alt={p.name || "Logo"} className="invoice-logo" />
        ) : null}
        <div className="brand-text">
          <h2 className="org-name">{p.name}</h2>
          {details.length > 0 && (
            <div className="org-details">
              {details.map((d, i) => (
                <div className="org-line" key={i}>
                  <span className="org-label">{d.label}:</span> {d.value}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="invoice-title-block">
        <h1 className="invoice-title">{title}</h1>
        {status && (
          <span
            className="status-badge-inline"
            style={{ backgroundColor: statusColor(status) }}
          >
            {statusLabel}
          </span>
        )}
      </div>
    </div>
  );
}

export function BankDetails({ profile }) {
  const p = profile || {};
  const rows = [
    p.bankName && { label: "Bank", value: p.bankName },
    p.branch && { label: "Branch", value: p.branch },
    p.accountName && { label: "Account Name", value: p.accountName },
    p.accountNumber && { label: "A/C No", value: p.accountNumber },
    p.ifsc && { label: "IFSC", value: p.ifsc },
    p.upiId && { label: "UPI", value: p.upiId },
  ].filter(Boolean);

  if (rows.length === 0 && !p.invoiceFooter) return null;

  return (
    <>
      {rows.length > 0 && (
        <div className="bank-details">
          <h4>Bank Details</h4>
          <p>
            {rows.map((r, i) => (
              <span key={i}>
                <strong>{r.label}:</strong> {r.value}
                <br />
              </span>
            ))}
          </p>
        </div>
      )}
      {p.invoiceFooter && (
        <div className="company-note">
          <p>{p.invoiceFooter}</p>
        </div>
      )}
    </>
  );
}
