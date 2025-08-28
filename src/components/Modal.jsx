import React, { useEffect, useRef } from "react";

export default function Modal({
  open,
  title,
  onClose,
  children,
  autoFocusOnOpen = true,
}) {
  const dialogRef = useRef(null);
  const prevOpenRef = useRef(false);

  // Only autofocus when transitioning from CLOSED -> OPEN
  useEffect(() => {
    if (autoFocusOnOpen && open && !prevOpenRef.current) {
      const root = dialogRef.current;
      if (root) {
        const first = root.querySelector(
          "textarea, input, button, [href], select, [tabindex]:not([tabindex='-1'])"
        );
        (first || root).focus?.({ preventScroll: true });
      }
    }
    prevOpenRef.current = open;
  }, [open, autoFocusOnOpen]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop (clicking closes) */}
      <div
        className="absolute inset-0 bg-black/40 z-40"
        onClick={onClose}
      />

      {/* Centering layer; pointer events disabled so only the dialog gets them */}
      <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
        {/* Dialog */}
        <div
          ref={dialogRef}
          className="relative bg-white rounded-xl shadow-xl max-w-3xl w-[95%] p-4 outline-none pointer-events-auto"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded p-1 hover:bg-gray-100"
            >
              ✕
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
