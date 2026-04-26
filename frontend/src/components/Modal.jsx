import { useEffect } from "react";

/**
 * Modal — confirmations, alerts, danger prompts.
 *
 * Props:
 *   type        : "confirm" | "alert" | "danger"
 *   title       : heading
 *   message     : string or React node
 *   confirmText : confirm button label  (default "Confirm")
 *   cancelText  : cancel button label   (default "Cancel")
 *   onConfirm   : called on confirm
 *   onCancel    : called on cancel / backdrop click (omit to hide cancel)
 */
export default function Modal({
  type = "confirm",
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
}) {
  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onCancel?.(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCancel]);

  const icons   = { confirm: "💬", alert: "✅", danger: "🗑️" };
  const colors  = { confirm: "var(--primary)", alert: "var(--success)", danger: "var(--danger)" };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-icon">{icons[type]}</div>
        {title   && <div className="modal-title">{title}</div>}
        {message && (
          typeof message === "string"
            ? <div className="modal-message">{message}</div>
            : <div className="modal-message">{message}</div>
        )}
        <div className="modal-actions">
          {onCancel && (
            <button className="modal-btn modal-btn-cancel" onClick={onCancel}>
              {cancelText}
            </button>
          )}
          <button
            className="modal-btn modal-btn-confirm"
            style={{ background: colors[type] }}
            onClick={onConfirm}
            autoFocus
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
