// src/lib/toast.ts
type ToastArgs = {
  title?: string;
  description?: string;
  variant?: "default" | "success" | "destructive";
  durationMs?: number;
};

export function useToast() {
  function toast({
    title,
    description,
    durationMs = 3000,
  }: ToastArgs) {
    const msg = [title, description].filter(Boolean).join("\n");
    if (!msg) return;

    // minimalni, bez zavisnosti:
    const el = document.createElement("div");
    el.textContent = msg;
    Object.assign(el.style, {
      position: "fixed",
      right: "16px",
      bottom: "16px",
      padding: "10px 14px",
      background: "#111",
      color: "#fff",
      borderRadius: "10px",
      boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
      zIndex: "9999",
      fontSize: "14px",
      lineHeight: "1.3",
      maxWidth: "320px",
      whiteSpace: "pre-wrap",
    } as Partial<CSSStyleDeclaration>);
    document.body.appendChild(el);
    setTimeout(() => el.remove(), durationMs);
  }

  return { toast };
}