
import React from "react";

export default function Modal({ open, title, children, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-[96%] max-w-4xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold" style={{ color: "var(--secondary)" }}>{title}</h2>
          <button onClick={onClose} className="text-red-600 font-semibold">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
