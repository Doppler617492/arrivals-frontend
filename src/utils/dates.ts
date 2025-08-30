// src/utils/dates.ts
export function formatDateEU(iso?: string|null){
  if(!iso) return "-";
  const d = new Date(iso); if(isNaN(d.getTime())) return "-";
  const dd = String(d.getDate()).padStart(2,'0'); const mm = String(d.getMonth()+1).padStart(2,'0'); const yyyy=d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}
export function parseDateInput(val:any): string|null{
  if(val===undefined || val===null) return null;
  const s = String(val).trim(); if(!s) return null;
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if(m){ const d=new Date(Date.UTC(+m[3], +m[2]-1, +m[1])); return isNaN(d.getTime())?null:d.toISOString(); }
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)){ const d=new Date(s+'T00:00:00Z'); return isNaN(d.getTime())?null:d.toISOString(); }
  const d = new Date(s); return isNaN(d.getTime())?null:d.toISOString();
}