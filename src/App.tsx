import React, { useEffect, useMemo, useState } from 'react';

// ----------------------
// Types
// ----------------------
export type Arrival = {
  id: number;
  plate: string | null;
  supplier: string | null;
  carrier: string | null;
  type: 'truck' | 'van' | 'other' | string;
  status: 'announced' | 'arrived' | 'delayed' | 'cancelled' | string;
  eta: string | null;
  note: string | null;
  created_at: string; // ISO string
};

// ----------------------
// Tiny Toast system
// ----------------------
 type Toast = { id: number; title: string; description?: string; kind?: 'success'|'error'|'info' };
 function useToasts() {
   const [toasts, setToasts] = useState<Toast[]>([]);
   const pushToast = (t: Omit<Toast,'id'>) => {
     const id = Date.now() + Math.random();
     setToasts(prev => [...prev, { id, ...t }]);
     setTimeout(() => setToasts(prev => prev.filter(x => x.id !== id)), 3500);
   };
   const dismiss = (id: number) => setToasts(prev => prev.filter(x => x.id !== id));
   return { toasts, pushToast, dismiss };
 }

 function ToastViewport({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id:number)=>void }) {
   return (
     <div style={{ position:'fixed', right:16, bottom:16, display:'flex', flexDirection:'column', gap:8, zIndex:1000 }}>
       {toasts.map(t => (
         <div key={t.id} style={{
           minWidth: 280,
           maxWidth: 420,
           padding: '12px 14px',
           borderRadius: 10,
           boxShadow: '0 6px 24px rgba(0,0,0,0.15)',
           color: '#0b1324',
           background: t.kind === 'error' ? '#ffe8e8' : t.kind === 'success' ? '#e8fff0' : '#eef3ff',
           border: `1px solid ${t.kind === 'error' ? '#ffb2b2' : t.kind === 'success' ? '#b7f0cb' : '#c9d6ff'}`,
         }}>
           <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontWeight:600, marginBottom:4 }}>
             <span>{t.title}</span>
             <button onClick={() => dismiss(t.id)} style={{ background:'transparent', border:'none', cursor:'pointer', fontSize:16 }}>×</button>
           </div>
           {t.description && <div style={{ opacity:0.85 }}>{t.description}</div>}
         </div>
       ))}
     </div>
   );
 }

// ----------------------
// Helpers
// ----------------------
function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return String(iso);
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ----------------------
// Main App
// ----------------------
export default function App() {
  const { toasts, pushToast, dismiss } = useToasts();

  const [arrivals, setArrivals] = useState<Arrival[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState('');
  const [statusFlt, setStatusFlt] = useState<string>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // fetch
  async function fetchArrivals() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/arrivals');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Arrival[] = await res.json();
      setArrivals(data);
      pushToast({ title: 'Synced', description: 'Data refreshed from backend', kind: 'success' });
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
      pushToast({ title: 'Fetch failed', description: String(e), kind: 'error' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchArrivals(); }, []);

  // filter + paginate
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return arrivals.filter(a => {
      if (statusFlt && a.status !== statusFlt) return false;
      if (!term) return true;
      const hay = `${a.plate ?? ''} ${a.supplier ?? ''} ${a.carrier ?? ''} ${a.status} ${a.type} ${a.note ?? ''}`.toLowerCase();
      return hay.includes(term);
    });
  }, [arrivals, q, statusFlt]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageFixed = Math.min(page, totalPages);
  const paged = filtered.slice((pageFixed - 1) * pageSize, pageFixed * pageSize);

  // KPI
  const kpis = useMemo(() => {
    const total = arrivals.length;
    const arrived = arrivals.filter(a => a.status === 'arrived').length;
    const announced = arrivals.filter(a => a.status === 'announced').length;
    const delayed = arrivals.filter(a => a.status === 'delayed').length;
    return [
      { label: 'Total', value: total },
      { label: 'Arrived', value: arrived },
      { label: 'Announced', value: announced },
      { label: 'Delayed', value: delayed },
    ];
  }, [arrivals]);

  // actions
  function exportCSV(rows: Arrival[]) {
    const headers = ['ID','Plate','Supplier','Carrier','Type','Status','ETA','Note','Created At'];
    const csvRows = [headers.join(',')].concat(
      rows.map(a => [
        a.id,
        JSON.stringify(a.plate ?? ''),
        JSON.stringify(a.supplier ?? ''),
        JSON.stringify(a.carrier ?? ''),
        JSON.stringify(a.type ?? ''),
        JSON.stringify(a.status ?? ''),
        JSON.stringify(a.eta ?? ''),
        JSON.stringify(a.note ?? ''),
        JSON.stringify(a.created_at ?? ''),
      ].join(','))
    );
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, `arrivals_${new Date().toISOString().slice(0,10)}.csv`);
    pushToast({ title: 'CSV exported', kind: 'success' });
  }

  async function exportPDF(rows: Arrival[]) {
    try {
      const [{ jsPDF }, autoTable] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable') as any,
      ]);
      const doc = new jsPDF({ orientation: 'landscape' });
      (autoTable as any).default(doc, {
        head: [['ID','Plate','Supplier','Carrier','Type','Status','ETA','Note','Created At']],
        body: rows.map(a => [
          a.id,
          a.plate ?? '',
          a.supplier ?? '',
          a.carrier ?? '',
          a.type ?? '',
          a.status ?? '',
          a.eta ?? '',
          a.note ?? '',
          a.created_at ?? '',
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [20, 60, 160] },
        theme: 'grid',
        margin: 10,
      });
      doc.save(`arrivals_${new Date().toISOString().slice(0,10)}.pdf`);
      pushToast({ title: 'PDF exported', kind: 'success' });
    } catch (e:any) {
      pushToast({ title: 'PDF export failed', description: String(e), kind: 'error' });
    }
  }

  function requestNotif() {
    if (!('Notification' in window)) {
      pushToast({ title: 'Notifications not supported', kind: 'error' });
      return;
    }
    Notification.requestPermission().then(res => {
      if (res === 'granted') {
        new Notification('Notifications enabled', { body: 'You will get native alerts.' });
        pushToast({ title: 'Notifications enabled', kind: 'success' });
      } else {
        pushToast({ title: 'Notifications denied', kind: 'error' });
      }
    });
  }

  // ---------------------- UI ----------------------
  return (
    <div style={{ display:'grid', gridTemplateColumns:'280px 1fr', minHeight:'100vh', background:'#0b1220', color:'#e6ebff' }}>
      {/* Sidebar */}
      <aside style={{ borderRight:'1px solid #1d2742', padding:16, position:'sticky', top:0, height:'100vh' }}>
        <div style={{ fontWeight:800, fontSize:22, letterSpacing:.3, marginBottom:8 }}>Arrivals</div>
        <div style={{ fontSize:12, opacity:.7, marginBottom:24 }}>Dock planning & tracking</div>

        <div style={{ display:'grid', gap:8 }}>
          <button onClick={fetchArrivals} disabled={loading} style={btn('primary')}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button onClick={() => exportCSV(filtered)} style={btn()}>Export CSV</button>
          <button onClick={() => exportPDF(filtered)} style={btn()}>Export PDF</button>
          <button onClick={requestNotif} style={btn('ghost')}>Enable Notifications</button>
        </div>

        <div style={{ height:1, background:'#1d2742', margin:'20px 0' }} />

        <div style={{ fontSize:12, opacity:.7, marginBottom:8 }}>Filters</div>
        <div style={{ display:'grid', gap:8 }}>
          <input
            placeholder="Search plate / supplier / note…"
            value={q}
            onChange={e => { setPage(1); setQ(e.target.value); }}
            style={inputStyle}
          />
          <select value={statusFlt} onChange={e => { setPage(1); setStatusFlt(e.target.value); }} style={inputStyle}>
            <option value="">All statuses</option>
            <option value="announced">Announced</option>
            <option value="arrived">Arrived</option>
            <option value="delayed">Delayed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))} style={inputStyle}>
            <option value={10}>10 / page</option>
            <option value={25}>25 / page</option>
            <option value={50}>50 / page</option>
          </select>
        </div>

        <div style={{ position:'absolute', bottom:16, left:16, right:16, fontSize:12, opacity:.65 }}>
          <div>Backend: <code>/api/arrivals</code></div>
          {error && <div style={{ color:'#ffb3b3', marginTop:6 }}>Error: {error}</div>}
        </div>
      </aside>

      {/* Main */}
      <main style={{ padding:24 }}>
        {/* Topbar */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <div>
            <div style={{ fontSize:24, fontWeight:800 }}>Inbound schedule</div>
            <div style={{ opacity:.7 }}>Live overview of all announced and arrived trucks</div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={fetchArrivals} disabled={loading} style={btn('primary')}>{loading ? 'Refreshing…' : 'Refresh'}</button>
            <button onClick={() => exportCSV(filtered)} style={btn()}>CSV</button>
            <button onClick={() => exportPDF(filtered)} style={btn()}>PDF</button>
          </div>
        </div>

        {/* KPI Bar */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4, minmax(0, 1fr))', gap:12, marginBottom:16 }}>
          {kpis.map(k => (
            <div key={k.label} style={{ background:'#0f1830', border:'1px solid #1d2742', borderRadius:12, padding:12 }}>
              <div style={{ fontSize:12, opacity:.7 }}>{k.label}</div>
              <div style={{ fontSize:24, fontWeight:800 }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Table */}
        <div style={{ background:'#0f1830', border:'1px solid #1d2742', borderRadius:12, overflow:'hidden' }}>
          <div style={{ display:'grid', gridTemplateColumns:'80px 120px 1fr 1fr 120px 120px 160px 1fr', padding:'10px 12px', borderBottom:'1px solid #1d2742', fontSize:12, opacity:.8 }}>
            <div>ID</div>
            <div>Plate</div>
            <div>Supplier</div>
            <div>Carrier</div>
            <div>Type</div>
            <div>Status</div>
            <div>Created</div>
            <div>Note</div>
          </div>
          {paged.length === 0 && (
            <div style={{ padding:24, opacity:.7 }}>No results.</div>
          )}
          {paged.map(a => (
            <div key={a.id} style={{ display:'grid', gridTemplateColumns:'80px 120px 1fr 1fr 120px 120px 160px 1fr', padding:'12px', borderBottom:'1px solid #1d2742', alignItems:'center' }}>
              <div>#{a.id}</div>
              <div style={{ fontWeight:600 }}>{a.plate ?? '—'}</div>
              <div>{a.supplier ?? '—'}</div>
              <div>{a.carrier ?? '—'}</div>
              <div>{a.type}</div>
              <div><StatusPill value={a.status} /></div>
              <div style={{ opacity:.9 }}>{fmtDate(a.created_at)}</div>
              <div style={{ opacity:.9, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{a.note ?? ''}</div>
            </div>
          ))}
        </div>

        {/* Pagination */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:12 }}>
          <div style={{ opacity:.7, fontSize:12 }}>{filtered.length} results • Page {pageFixed} / {totalPages}</div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={pageFixed===1} style={btn('ghost')}>Prev</button>
            <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={pageFixed===totalPages} style={btn('ghost')}>Next</button>
          </div>
        </div>
      </main>

      <ToastViewport toasts={toasts} dismiss={dismiss} />
    </div>
  );
}

function StatusPill({ value }: { value: string }) {
  const map: Record<string, { bg:string; dot:string; label:string } > = {
    announced: { bg:'#203158', dot:'#7aa2ff', label:'Announced' },
    arrived:   { bg:'#1d3a2b', dot:'#7ce2a0', label:'Arrived' },
    delayed:   { bg:'#3a2a1d', dot:'#ffcf7a', label:'Delayed' },
    cancelled: { bg:'#3a1d24', dot:'#ff9aaa', label:'Cancelled' },
  };
  const c = map[value] ?? { bg:'#26324a', dot:'#cbd5e1', label:value };
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:8, background:c.bg, border:'1px solid #1d2742', padding:'6px 10px', borderRadius:999, fontSize:12 }}>
      <span style={{ width:8, height:8, borderRadius:999, background:c.dot, display:'inline-block' }} />
      {c.label}
    </span>
  );
}

const inputStyle: React.CSSProperties = {
  background:'#0f1830',
  border:'1px solid #1d2742',
  color:'#e6ebff',
  borderRadius:10,
  padding:'10px 12px',
  outline:'none',
};

function btn(variant: 'primary'|'ghost'|undefined = undefined): React.CSSProperties {
  if (variant === 'primary') {
    return {
      background: 'linear-gradient(180deg, #2b5cff 0%, #1740c2 100%)',
      border: '1px solid #2b5cff',
      color: 'white',
      borderRadius: 10,
      padding: '10px 12px',
      cursor: 'pointer',
      fontWeight: 700,
    };
  }
  if (variant === 'ghost') {
    return {
      background: 'transparent',
      border: '1px solid #1d2742',
      color: '#e6ebff',
      borderRadius: 10,
      padding: '10px 12px',
      cursor: 'pointer',
      fontWeight: 600,
    };
  }
  return {
    background: '#122042',
    border: '1px solid #1d2742',
    color: '#e6ebff',
    borderRadius: 10,
    padding: '10px 12px',
    cursor: 'pointer',
    fontWeight: 600,
  };
}