import React from "react";

export function Toast({ toast }) {
  if (!toast?.message) {
    return null;
  }

  return (
    <div
      className={`app-toast app-toast--${toast.type || "info"}`}
      role="status"
      aria-live="polite"
    >
      {toast.message}
    </div>
  );
}
