import { useState } from "react";
import { apiDelete } from "../api";

/**
 * Shared delete behaviour for Sales Invoices, Purchase Invoices, Quotations
 * and Non-GST Bills so every screen confirms, reports and refreshes the same
 * way.
 *
 * The backend owns the rules about what may actually be deleted (a finalized
 * invoice must be cancelled instead, a converted quotation is protected, and
 * so on). This hook simply surfaces whatever the backend decides, so the UI
 * can never drift from the real policy.
 *
 * Usage:
 *   const del = useDeleteDocument({ basePath: "/sales", label: "invoice", onDeleted: refetch });
 *   <button onClick={() => del.remove(inv.id, inv.invoiceNumber)} disabled={del.isDeleting(inv.id)}>
 */
export function useDeleteDocument({ basePath, label, onDeleted }) {
  const [deletingId, setDeletingId] = useState(null);
  const [message, setMessage] = useState(null); // { type: "success" | "error", text }

  const remove = async (id, displayNumber) => {
    const name = displayNumber ? `${label} ${displayNumber}` : `this ${label}`;
    if (!window.confirm(`Delete ${name}?\n\nThis cannot be undone.`)) return false;

    setDeletingId(id);
    setMessage(null);
    try {
      await apiDelete(`${basePath}/${id}`);
      setMessage({ type: "success", text: `Deleted ${name}.` });
      if (onDeleted) await onDeleted();
      return true;
    } catch (e) {
      // A record already removed in another tab should read as gone, not as a crash.
      const text =
        e.code === "NOT_FOUND"
          ? `That ${label} no longer exists. The list has been refreshed.`
          : e.message || `Could not delete ${name}.`;
      setMessage({ type: "error", text });
      if (e.code === "NOT_FOUND" && onDeleted) await onDeleted();
      return false;
    } finally {
      setDeletingId(null);
    }
  };

  return {
    remove,
    message,
    clearMessage: () => setMessage(null),
    isDeleting: (id) => deletingId === id,
    busy: deletingId !== null,
  };
}
