import React from "react";

export function useToast(timeoutMs = 1500) {
  const [toast, setToast] = React.useState(null);
  const timerRef = React.useRef(null);

  const showToast = React.useCallback((message, type = "success") => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }

    setToast({ message, type });
    timerRef.current = window.setTimeout(() => {
      setToast(null);
      timerRef.current = null;
    }, timeoutMs);
  }, [timeoutMs]);

  React.useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  return {
    toast,
    showToast,
    showSuccess: (message) => showToast(message, "success"),
    showError: (message) => showToast(message, "error")
  };
}
