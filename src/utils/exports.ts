import jsPDF from "jspdf";
import "jspdf-autotable";

export function exportCSV<T extends Record<string, any>>(rows: T[], filename = "arrivals.csv") {
  if (!rows?.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escapeCsv(r[h])).join(",")),
  ].join("\n");
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), filename);
}

export function exportPDF<T extends Record<string, any>>(rows: T[], filename = "arrivals.pdf") {
  if (!rows?.length) return;
  const headers = Object.keys(rows[0]);
  const doc = new jsPDF();
  (doc as any).autoTable({
    head: [headers],
    body: rows.map((r) => headers.map((h) => (r[h] ?? "").toString())),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [240, 240, 240] },
    margin: { top: 14 },
  });
  doc.save(filename);
}

function escapeCsv(val: any) {
  const s = (val ?? "").toString();
  return /[",\n]/.test(s) ? \`"\${s.replace(/"/g, '""')}"\` : s;
}
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
