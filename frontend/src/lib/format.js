const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(value) {
  if (!value) return "";
  const s = String(value);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return s.slice(0, 10);
  const [, y, mo, d] = m;
  return `${d}-${MONTHS[Number(mo) - 1]}-${y}`;
}

export function todayISO() {
  return new Date().toISOString().split("T")[0];
}
