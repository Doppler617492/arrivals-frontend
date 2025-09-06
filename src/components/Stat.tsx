import { ReactNode } from "react";

type StatProps = {
  label: string;
  value: ReactNode;
  hint?: string;
};

export function Stat({ label, value, hint }: StatProps) {
  return (
    <div className="rounded-2xl border p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      {hint ? <div className="text-xs text-gray-500 mt-1">{hint}</div> : null}
    </div>
  );
}
