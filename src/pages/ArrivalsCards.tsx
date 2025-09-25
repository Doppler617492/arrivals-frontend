import React from 'react';
import { Card, Row, Col, Space, Tag, Button, Input, Select, DatePicker, Modal, Form, message, Empty, InputNumber, Popconfirm, Popover, List } from 'antd';
import dayjs from 'dayjs';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CarOutlined, CalendarOutlined, EnvironmentOutlined, UserOutlined, IdcardOutlined, FileTextOutlined, DollarCircleOutlined, AuditOutlined, PaperClipOutlined, SearchOutlined, TagsOutlined } from '@ant-design/icons';
import { apiGET, apiPOST, apiPATCH, apiDELETE, qs, API_BASE, getToken } from '../api/client';
import { exportCSV as exportCSVUtil } from '../utils/exports';

type Arrival = {
  id: number;
  supplier?: string;
  carrier?: string;
  plate?: string;
  type?: string;
  driver?: string;
  pickup_date?: string; // ISO
  eta?: string; // ISO
  transport_price?: number;
  goods_price?: number;
  freight_cost?: number;
  goods_cost?: number;
  status?: 'not_shipped' | 'shipped' | 'arrived' | string;
  location?: string;
  transport_type?: string;
  note?: string;
  responsible?: string;
  category?: string;
};

// Options (replicate prior dataset)
const RESPONSIBLE_OPTIONS = ["Ludvig", "Gazi", "Gezim", "Armir", "Rrezart", "Beki"];
const LOCATION_OPTIONS = [
  "Veleprodajni Magacin","Carinsko Skladiste","Pg Centar","Pg","Bar","Bar Centar",
  "Budva","Kotor Centar","Herceg Novi","Herceg Novi Centar","Niksic","Bijelo polje","Ulcinj Centar","Horeca"
];

// Kategorije (bezbjedno za frontend; backend fallback u localStorage)
const CATEGORY_OPTIONS = [
  "Tekstil",
  "Dekoracije",
  "Horec",
  "Pokucstvo",
  "Sanitarije",
  "Autoprogram",
  "Elektirca I rasvijeta",
  "Mali kucni aparati",
  "Igracke",
  "Basteski program",
  "Novogodisnji",
  "Sport",
  "Kozmetik",
  "Namjestaj",
  "Nautic",
  "Travel",
];

const statusLabel: Record<'not_shipped'|'shipped'|'arrived', string> = {
  not_shipped: 'Najavljeno',
  shipped: 'U transportu',
  arrived: 'Stiglo',
};
function normalizeStatus(s: any): 'not_shipped' | 'shipped' | 'arrived' {
  const v = String(s || '').toLowerCase().replace(/\s+/g, '_');
  if (['announced','not_shipped','not-shipped','notshipped','najavljeno'].includes(v)) return 'not_shipped';
  if (['shipped','in_transit','in-transit','intransit','u_transportu'].includes(v)) return 'shipped';
  return 'arrived';
}

function normalizeCategory(c?: string): string {
  const raw = String(c || '').trim();
  if (!raw) return '';
  if (raw === 'Mali kuci aparati') return 'Mali kucni aparati';
  return raw;
}

export default function ArrivalsCards() {
  const [rows, setRows] = React.useState<Arrival[]>([]);
  const [q, setQ] = React.useState('');
  const [status, setStatus] = React.useState<string>('');
  const [locationF, setLocationF] = React.useState<string>('');
  const [responsibleF, setResponsibleF] = React.useState<string[]>([]);
  const [categoryF, setCategoryF] = React.useState<string>('');
  const [dateFrom, setDateFrom] = React.useState<string>('');
  const [dateTo, setDateTo] = React.useState<string>('');
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Arrival | null>(null);
  const [form] = Form.useForm<Arrival>();
  // Files modal state
  const [filesModalId, setFilesModalId] = React.useState<number | null>(null);
  const [filesList, setFilesList] = React.useState<Array<{ id:number; filename:string; url?:string; created_at?:string }>>([]);
  const [filesLoading, setFilesLoading] = React.useState(false);
  const [selectedFile, setSelectedFile] = React.useState<{ id:number; filename:string; url?:string } | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [previewType, setPreviewType] = React.useState<'image'|'pdf'|'html'|'none'>('none');
  const [previewHtml, setPreviewHtml] = React.useState<string>("");
  const [docsQuery, setDocsQuery] = React.useState<string>("");
  const [docsSort, setDocsSort] = React.useState<'date_desc'|'date_asc'|'name_asc'|'name_desc'>('date_desc');

  // Saved Views (persist filter combos)
  const [views, setViews] = React.useState<Record<string, any>>(() => {
    try { return JSON.parse(localStorage.getItem('arrivals_views') || '{}') || {}; } catch { return {}; }
  });
  const [selectedView, setSelectedView] = React.useState<string>('');

  const qc = useQueryClient();
  // Focus/highlight on hash (#ID) navigation
  React.useEffect(() => {
    function focusFromHash() {
      const id = Number((window.location.hash || '').replace('#',''));
      if (!id) return;
      // Try to locate the card by DOM id
      const el = document.getElementById(`arrival-${id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('flash-highlight');
        setTimeout(() => el.classList.remove('flash-highlight'), 1600);
      }
    }
    focusFromHash();
    window.addEventListener('hashchange', focusFromHash);
    return () => window.removeEventListener('hashchange', focusFromHash);
  }, []);
  const { data } = useQuery({
    queryKey: ['arrivals', { q, status, locationF, responsibleF, categoryF, dateFrom, dateTo }],
    queryFn: async () => {
      // Pass filters for server-side support (backend may ignore - we still map client-side)
      const query = qs({
        q,
        status,
        location: locationF,
        responsible: Array.isArray(responsibleF) && responsibleF.length ? responsibleF.join(',') : '',
        category: categoryF,
        from: dateFrom,
        to: dateTo
      });
      const url = query ? `/api/arrivals?${query}` : '/api/arrivals';
      const arr = await apiGET<any[]>(url, true).catch(() => []);
      const list = Array.isArray(arr) ? arr : [];
      let localMap: Record<string, string> = {};
      try { localMap = JSON.parse(localStorage.getItem('arrivals_category_map') || '{}') || {}; } catch {}
      const out = list.map((a: any) => {
        const id = Number(a.id);
        const fromLocal = localMap[String(id)] || '';
        const cat = normalizeCategory(a.category || fromLocal || '');
        // Migrate typo in local storage if present
        if (fromLocal && fromLocal !== cat) {
          try {
            localMap[String(id)] = cat;
            localStorage.setItem('arrivals_category_map', JSON.stringify(localMap));
          } catch {}
        }
        return {
          ...a,
          id,
          status: normalizeStatus(a.status),
          category: cat,
        } as Arrival;
      });
      return out as Arrival[];
    },
    refetchOnMount: false,
    staleTime: 180_000,
  });
  React.useEffect(() => {
    if (Array.isArray(data)) setRows(data);
  }, [data]);

  const [searchValue, setSearchValue] = React.useState('');
  React.useEffect(() => { const t = setTimeout(() => setQ(searchValue), 400); return () => clearTimeout(t); }, [searchValue]);

  const filtered = React.useMemo(() => {
    const qq = q.trim().toLowerCase();
    const inRange = (iso?: string) => {
      if (!iso) return true;
      const d = iso.slice(0,10);
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    };
    return rows.filter(r => {
      if (status && normalizeStatus(r.status) !== status) return false as any;
      if (locationF && (r.location || '').toLowerCase() !== locationF.toLowerCase()) return false as any;
      if (Array.isArray(responsibleF) && responsibleF.length) {
        const cur = (r.responsible || '').toLowerCase();
        if (!responsibleF.some(v => v.toLowerCase() === cur)) return false as any;
      }
      if (categoryF && (r.category || '').toLowerCase() !== categoryF.toLowerCase()) return false as any;
      if (!inRange(r.eta)) return false as any;
      if (!qq) return true;
      const hay = [r.id, r.supplier, r.carrier, r.plate, r.driver, r.location, r.category].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(qq);
    });
  }, [rows, q, status, locationF, responsibleF, categoryF, dateFrom, dateTo]);

  // --- Status ops and DnD helpers (for kanban columns) ---
  async function updateStatus(id: number, next: 'not_shipped'|'shipped'|'arrived') {
    // optimistic UI
    setRows(prev => prev.map(r => r.id === id ? { ...r, status: next } : r));
    try {
      await apiPATCH(`/api/arrivals/${id}`, { status: next }, true);
      qc.invalidateQueries({ queryKey: ['arrivals'] });
    } catch (e:any) {
      // fallback na eksplicitni endpoint kad PATCH nije dozvoljen
      try {
        await apiPOST(`/api/arrivals/${id}/status`, { status: next }, { auth: true });
        qc.invalidateQueries({ queryKey: ['arrivals'] });
      } catch {
        message.error('Promjena statusa nije uspjela');
        qc.invalidateQueries({ queryKey: ['arrivals'] });
      }
    }
  }

  function onDragStart(e: React.DragEvent, id: number) {
    try { e.dataTransfer.setData('text/plain', String(id)); } catch {}
  }

  function makeDropHandlers(next: 'not_shipped'|'shipped'|'arrived') {
    return {
      onDragOver: (e: React.DragEvent) => { e.preventDefault(); },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        const t = e.dataTransfer.getData('text/plain');
        const id = Number(t);
        if (!Number.isFinite(id)) return;
        updateStatus(id, next);
      }
    } as {
      onDragOver: (e: React.DragEvent) => void;
      onDrop: (e: React.DragEvent) => void;
    };
  }

  const groups = React.useMemo(() => {
    const g: Record<'not_shipped'|'shipped'|'arrived', Arrival[]> = { not_shipped: [], shipped: [], arrived: [] } as any;
    filtered.forEach(r => {
      const s = normalizeStatus(r.status) as 'not_shipped'|'shipped'|'arrived';
      (g as any)[s].push(r);
    });
    return g;
  }, [filtered]);

  // Realtime updates are handled centrally in lib/realtime via wireRealtimeToQueryClient

  // Actions (unused helpers removed)

  // Export helpers
  function exportCSV() {
    const rowsOut = filtered.map(r => ({
      id: r.id,
      supplier: r.supplier || '',
      status: statusLabel[normalizeStatus(r.status)],
      location: r.location || '',
      responsible: r.responsible || '',
      category: r.category || '',
      eta: r.eta ? new Date(r.eta).toLocaleString() : '',
      pickup: r.pickup_date ? new Date(r.pickup_date).toLocaleString() : '',
      type: r.type || r.transport_type || '',
      carrier: r.carrier || '',
      plate: r.plate || '',
      driver: r.driver || '',
      transport_price: typeof r.transport_price === 'number' ? r.transport_price : '',
      goods_price: typeof r.goods_price === 'number' ? r.goods_price : '',
      note: r.note || '',
    }));
    if (!rowsOut.length) { message.info('Nema podataka za izvoz'); return; }
    exportCSVUtil(rowsOut, 'dolasci.csv');
  }
  async function exportXLSX() {
    try {
      const XLSX = (await import('xlsx')).default || (await import('xlsx'));
      const rowsOut = filtered.map(r => ({
        ID: r.id,
        Dobavljac: r.supplier || '',
        Status: statusLabel[normalizeStatus(r.status)],
        Lokacija: r.location || '',
        Odgovorna: r.responsible || '',
        Kategorija: r.category || '',
        ETA: r.eta ? new Date(r.eta).toLocaleString() : '',
        Pickup: r.pickup_date ? new Date(r.pickup_date).toLocaleString() : '',
        Tip: r.type || r.transport_type || '',
        Prevoznik: r.carrier || '',
        Tablice: r.plate || '',
        Vozac: r.driver || '',
        PrevozEUR: typeof r.transport_price === 'number' ? r.transport_price : '',
        RobaEUR: typeof r.goods_price === 'number' ? r.goods_price : '',
        Napomena: r.note || '',
      }));
      if (!rowsOut.length) { message.info('Nema podataka za izvoz'); return; }
      const ws = XLSX.utils.json_to_sheet(rowsOut);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Dolasci');
      XLSX.writeFile(wb, 'dolasci.xlsx');
    } catch {
      message.error('Ne mogu izvesti XLSX (xlsx modul nije dostupan).');
    }
  }

  // Saved views operations
  function saveCurrentView() {
    const name = window.prompt('Naziv pogleda:');
    if (!name) return;
    const next = {
      ...views,
      [name]: { q, status, locationF, responsibleF, categoryF, dateFrom, dateTo },
    };
    setViews(next);
    setSelectedView(name);
    localStorage.setItem('arrivals_views', JSON.stringify(next));
    message.success('Pogled sačuvan');
  }
  function deleteView() {
    if (!selectedView) return;
    const next = { ...views } as Record<string, any>;
    delete next[selectedView];
    setViews(next);
    setSelectedView('');
    localStorage.setItem('arrivals_views', JSON.stringify(next));
    message.success('Pogled obrisan');
  }
  function applyView(name: string) {
    const v = views?.[name];
    if (!v) return;
    setSelectedView(name);
    setQ(v.q || '');
    setStatus(v.status || '');
    setLocationF(v.locationF || '');
    setResponsibleF(Array.isArray(v.responsibleF) ? v.responsibleF : (v.responsibleF ? [v.responsibleF] : []));
    setCategoryF(v.categoryF || '');
    setDateFrom(v.dateFrom || '');
    setDateTo(v.dateTo || '');
  }

  // Category helpers with local fallback
  function setLocalCategory(id: number, category: string) {
    try {
      const raw = localStorage.getItem('arrivals_category_map');
      const map = raw ? JSON.parse(raw) : {};
      if (category) map[String(id)] = category; else delete map[String(id)];
      localStorage.setItem('arrivals_category_map', JSON.stringify(map));
    } catch {}
  }
  function onAdd() {
    setEditing(null);
    form.resetFields();
    setOpen(true);
  }
  function onEdit(r: Arrival) {
    setEditing(r);
    const values: any = { ...r };
    if (r.eta) values.eta = dayjs(r.eta);
    if (r.pickup_date) values.pickup_date = dayjs(r.pickup_date);
    form.setFieldsValue(values);
    setOpen(true);
  }
  async function onDelete(r: Arrival) {
    const idNum = Number(r.id);
    // Optimistically drop the card locally and from cached lists
    setRows((prev) => prev.filter((x) => Number(x.id) !== idNum));
    try {
      qc.setQueriesData({ queryKey: ['arrivals'] }, (old: any) =>
        Array.isArray(old) ? old.filter((x: any) => Number(x.id) !== idNum) : old
      );
    } catch {}

    const restore = () => {
      setRows((prev) => {
        if (prev.some((x) => Number(x.id) === idNum)) return prev;
        return [...prev, r];
      });
      try {
        qc.setQueriesData({ queryKey: ['arrivals'] }, (old: any) => {
          if (!Array.isArray(old)) return old;
          if (old.some((x: any) => Number(x.id) === idNum)) return old;
          return [...old, r];
        });
      } catch {}
    };

    try {
      await apiDELETE(`/api/arrivals/${idNum}`, true);
      message.success('Obrisano');
    } catch (err: any) {
      const raw = String(err?.message || '').trim();
      const needsFallback = /405|method not allowed|not allowed|unsupported/i.test(raw);
      if (needsFallback) {
        try {
          await apiPOST(`/api/arrivals/delete`, { id: idNum }, { auth: true });
          message.success('Obrisano');
          return;
        } catch (retryErr: any) {
          const fallbackMsg = String(retryErr?.message || raw || 'Brisanje nije uspjelo').trim();
          message.error(fallbackMsg || 'Brisanje nije uspjelo');
          restore();
          qc.invalidateQueries({ queryKey: ['arrivals'] });
          return;
        }
      }
      message.error(raw || 'Brisanje nije uspjelo');
      restore();
      qc.invalidateQueries({ queryKey: ['arrivals'] });
    }
  }

  async function onSubmit() {
    try {
      const v = await form.validateFields();
      const payload: any = {
        ...v,
        // backend expects ISO without time requirement; keep date only
        eta: v.eta ? (v.eta as any).toISOString() : undefined,
        pickup_date: v.pickup_date ? (v.pickup_date as any).toISOString() : undefined,
        // map to backend field names
        freight_cost: typeof v.freight_cost === 'number' ? v.freight_cost : undefined,
        goods_cost: typeof v.goods_cost === 'number' ? v.goods_cost : undefined,
      };
      if (editing) {
        const resp = await apiPATCH<any>(`/api/arrivals/${editing.id}`, payload, true);
        // ensure local category cache aligns immediately
        const cat = String(payload.category || resp?.category || '').trim();
        if (cat) setLocalCategory(Number(editing.id), cat);
        message.success('Sačuvano');
      } else {
        const created = await apiPOST<any>('/api/arrivals', payload, { auth: true });
        const newId = Number(created?.id);
        const cat = String(payload.category || created?.category || '').trim();
        if (Number.isFinite(newId) && cat) setLocalCategory(newId, cat);
        message.success('Kreirano');
      }
      setOpen(false); qc.invalidateQueries({ queryKey: ['arrivals'] });
    } catch {}
  }

  // ---- Documents (upload/preview) ----
  async function listFiles(arrivalId: number) {
    setFilesLoading(true);
    try {
      const token = getToken();
      if (!token) { alert('Potrebna je prijava'); setFilesList([]); return; }
      const res = await fetch(`${API_BASE}/api/arrivals/${arrivalId}/files`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const items = (Array.isArray(data) ? data : []).map((it:any) => ({
        id: Number(it.id),
        filename: String(it.filename || it.original_name || `file-${it.id}`),
        url: it.url || `/api/arrivals/${arrivalId}/files/${it.id}/download`,
        created_at: it.uploaded_at || it.created_at,
      }));
      setFilesList(items);
      // sync files_count on the card
      setRows(prev => prev.map(r => r.id === arrivalId ? { ...r, files_count: items.length } as any : r));
    } catch (e) {
      setFilesList([]);
    } finally {
      setFilesLoading(false);
    }
  }
  function openDocs(arrivalId: number) {
    setFilesModalId(arrivalId);
    listFiles(arrivalId);
  }
  async function uploadDoc(arrivalId: number, files?: FileList | null) {
    if (!files || files.length === 0) return;
    const fd = new FormData();
    // Backend prihvata i 'file' i višestruke 'files'
    if (files.length === 1) {
      fd.append('file', files[0]);
    } else {
      Array.from(files).forEach(f => fd.append('files', f));
    }
    const token = getToken();
    if (!token) { alert('Potrebna je prijava'); return; }
    await fetch(`${API_BASE}/api/arrivals/${arrivalId}/files`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }, // bez Content-Type; browser dodaje boundary
      body: fd,
    });
    await listFiles(arrivalId);
    // update files_count na kartici da odmah vidi broj
    setRows(prev => prev.map(r => r.id === arrivalId ? { ...r, files_count: (r as any).files_count ? (r as any).files_count + (files?.length || 0) : (files?.length || 0) } : r));
  }
  async function deleteDoc(arrivalId: number, fileId: number) {
    const token = getToken();
    if (!token) { alert('Potrebna je prijava'); return; }
    await fetch(`${API_BASE}/api/arrivals/${arrivalId}/files/${fileId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    await listFiles(arrivalId);
    setRows(prev => prev.map(r => r.id === arrivalId ? { ...r, files_count: Math.max(0, ((r as any).files_count || 1) - 1) } : r));
  }

  function detectType(name: string): 'image'|'pdf'|'html' {
    const n = name.toLowerCase();
    if (/(\.png|\.jpg|\.jpeg|\.gif|\.webp)$/.test(n)) return 'image';
    if (/\.pdf$/.test(n)) return 'pdf';
    return 'html'; // excel/csv will be rendered to html table
  }

  async function showPreview(f: { id:number; filename:string; url?:string }) {
    setSelectedFile(f);
    const t = detectType(f.filename);
    setPreviewType(t);
    setPreviewLoading(true);
    try {
      const fileUrl = `${API_BASE}${f.url || ''}`;
      if (t === 'image' || t === 'pdf') {
        // no extra fetch needed; iframe/img will load directly
        setPreviewHtml("");
      } else {
        // Try to render CSV/XLSX to HTML table via SheetJS
      const token = getToken();
      const res = await fetch(fileUrl, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('text/csv') || /\.csv$/i.test(f.filename)) {
          const text = await res.text();
          const rowsAll = text.split(/\r?\n/).map(r => r.split(/;|,|\t/));
          const rows = rowsAll.slice(0, 100);
          const table = `<table style=\"border-collapse:collapse;width:100%\">${rows.map(r=>`<tr>${r.map(c=>`<td style=\\\"border:1px solid #e5e7eb;padding:4px\\\">${(c||'').replace(/&/g,'&amp;').replace(/</g,'&lt;')}</td>`).join('')}</tr>`).join('')}</table>`;
          setPreviewHtml(table);
        } else {
          const XLSX = (await import('xlsx')).default || (await import('xlsx'));
          const ab = await res.arrayBuffer();
          const wb = XLSX.read(ab, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const html = XLSX.utils.sheet_to_html(ws, { header: '', footer: '' });
          setPreviewHtml(html);
        }
      }
    } catch (e) {
      setPreviewHtml('<div style="color:#999">Ne mogu prikazati fajl.</div>');
    } finally {
      setPreviewLoading(false);
    }
  }

  const filteredFiles = React.useMemo(() => {
    const q = docsQuery.trim().toLowerCase();
    let arr = filesList.filter(f => !q || f.filename.toLowerCase().includes(q));
    const byName = (a:any,b:any)=> a.filename.localeCompare(b.filename, 'sr');
    const toTime = (s?:string)=> s ? Date.parse(s) : 0;
    if (docsSort === 'name_asc') arr.sort(byName);
    else if (docsSort === 'name_desc') arr.sort((a,b)=> byName(b,a));
    else if (docsSort === 'date_asc') arr.sort((a,b)=> toTime(a.created_at)-toTime(b.created_at));
    else arr.sort((a,b)=> toTime(b.created_at)-toTime(a.created_at));
    return arr;
  }, [filesList, docsQuery, docsSort]);

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Card title="Dolasci" extra={
        <Space>
          <Select value={selectedView||undefined} placeholder="Sačuvani pogledi" style={{ width: 180 }} allowClear onChange={(v)=> v? applyView(v): setSelectedView('')} options={Object.keys(views||{}).map(k=> ({ value:k, label:k }))} />
          <Button onClick={saveCurrentView}>Sačuvaj pogled</Button>
          <Button danger disabled={!selectedView} onClick={deleteView}>Obriši pogled</Button>
          <Button onClick={exportCSV}>Export CSV</Button>
          <Button onClick={exportXLSX}>Export XLSX</Button>
          <Button type="primary" onClick={onAdd}>+ Novi dolazak</Button>
        </Space>
      }>
        {/* Redesigned filter bar: 4 clear columns with icons and badge styles */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] rounded-xl p-3 shadow-sm">
          {/* 1) Search */}
          <div>
            <div className="text-xs font-medium text-slate-500 mb-1">Pretraga</div>
            <Input.Search
              placeholder="Pretraga dolazaka…"
              allowClear
              value={searchValue}
              onChange={(e)=> setSearchValue(e.target.value)}
              prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            />
          </div>
          {/* 2) Status with colored badges */}
          <div>
            <div className="text-xs font-medium text-slate-500 mb-1">Statusi</div>
            <Select
              value={status}
              onChange={setStatus}
              placeholder="Status"
              allowClear
              style={{ width: '100%' }}
              optionLabelProp="label"
              options={[
                { value: 'not_shipped', label: (<Tag color="gold">Najavljeno</Tag>) },
                { value: 'shipped',     label: (<Tag color="red">U transportu</Tag>) },
                { value: 'arrived',     label: (<Tag color="green">Stiglo</Tag>) },
              ]}
            />
          </div>
          {/* 3) Location with icon in label */}
          <div>
            <div className="text-xs font-medium text-slate-500 mb-1">Lokacije</div>
            <Select
              value={locationF}
              onChange={setLocationF}
              placeholder="Lokacija"
              allowClear
              style={{ width: '100%' }}
              optionLabelProp="label"
              options={LOCATION_OPTIONS.map(v=> ({
                value: v,
                label: (
                  <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                    <EnvironmentOutlined style={{ color:'#94a3b8' }} />
                    {v}
                  </span>
                )
              }))}
            />
          </div>
          {/* 4) Responsible with avatar/icon in label */}
          <div>
            <div className="text-xs font-medium text-slate-500 mb-1">Odgovorne osobe</div>
            <Select
              mode="multiple"
              value={responsibleF}
              onChange={setResponsibleF}
              placeholder="Odgovorne osobe"
              allowClear
              style={{ width: '100%' }}
              optionLabelProp="label"
              options={RESPONSIBLE_OPTIONS.map(v=> ({
                value: v,
                label: (
                  <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                    <UserOutlined style={{ color:'#94a3b8' }} />
                    {v}
                  </span>
                )
              }))}
            />
          </div>
        </div>

        {/* Optional: date range under the main bar, keeping existing behavior */}
        <Space style={{ marginTop: 8 }} wrap>
          <DatePicker placeholder="Od" value={dateFrom? dayjs(dateFrom) : null} onChange={(d)=> setDateFrom(d? d.format('YYYY-MM-DD') : '')} />
          <DatePicker placeholder="Do" value={dateTo? dayjs(dateTo) : null} onChange={(d)=> setDateTo(d? d.format('YYYY-MM-DD') : '')} />
          <Select
            value={categoryF || undefined}
            onChange={(v)=> setCategoryF(v || '')}
            placeholder="Kategorija"
            allowClear
            style={{ minWidth: 200 }}
            options={CATEGORY_OPTIONS.map(v=> ({ value: v, label: v }))}
          />
        </Space>
      </Card>

      <Row gutter={[12,12]}>
        {(['not_shipped','shipped','arrived'] as const).map((key) => {
          const header = key === 'not_shipped' ? 'Najavljeno' : key === 'shipped' ? 'U transportu' : 'Stiglo';
          const color = key === 'not_shipped' ? '#1677ff' : key === 'shipped' ? '#ff4d4f' : '#55aa55';
          const dropHandlers = makeDropHandlers(key);
          const fmtEUR = (n: any) => typeof n === 'number' ? n.toLocaleString('en-GB', { style:'currency', currency:'EUR' }) : '-';
          return (
            <Col xs={24} md={8} key={key}>
              <div style={{ border:'1px solid #eee', borderRadius: 8, overflow:'hidden', minHeight: 200, background:'#fff' }} {...dropHandlers}>
                <div style={{ background: color, color:'#fff', padding:'8px 12px', fontWeight:700, display:'flex', justifyContent:'space-between' }}>
                  <span>{header}</span>
                  <span>{groups[key].length}</span>
                </div>
                <div style={{ padding: 8 }}>
                  {groups[key].length === 0 ? (
                    <Empty description="" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  ) : groups[key].map((r) => {
                    const s = normalizeStatus(r.status);
                    return (
                      <Card
                        key={r.id}
                        id={`arrival-${r.id}`}
                        size="small"
                        style={{ marginBottom: 8 }}
                        title={<Space size={8}>
                          <IdcardOutlined />
                          <span>#{r.id}</span>
                          <Tag color={s==='arrived'?'green':s==='shipped'?'red':'blue'}>{statusLabel[s]}</Tag>
                          <Tag icon={<PaperClipOutlined />} style={{ cursor:'pointer' }} onClick={(e)=> { e.stopPropagation(); openDocs(r.id); }}>
                            {(r as any).files_count ?? 0}
                          </Tag>
                          
                        </Space>}
                        extra={
                          <Select
                            size="small"
                            value={s}
                            style={{ width: 140 }}
                            onChange={(v)=> updateStatus(r.id, v as any)}
                            options={[
                              { value: 'not_shipped', label: 'Najavljeno' },
                              { value: 'shipped', label: 'U transportu' },
                              { value: 'arrived', label: 'Stiglo' },
                            ]}
                          />
                        }
                        draggable
                        onDragStart={(e)=> onDragStart(e, r.id)}
                        onDoubleClick={()=> onEdit(r)}
                      >
                        <Space direction="vertical" size={6} style={{ width: '100%' }}>
                          <div style={{ display:'flex', justifyContent:'space-between', gap:8 }}>
                            <div><FileTextOutlined style={{ marginRight: 6 }} /><strong>Dobavljač:</strong> {r.supplier || '-'}</div>
                            <div><CalendarOutlined style={{ marginRight: 6 }} /><strong>ETA:</strong> {r.eta ? new Date(r.eta).toLocaleDateString() : '-'}</div>
                          </div>
                          <div style={{ display:'flex', justifyContent:'space-between', gap:8 }}>
                            <div><EnvironmentOutlined style={{ marginRight: 6 }} /><strong>Lokacija:</strong> {r.location || '-'}</div>
                            <div><UserOutlined style={{ marginRight: 6 }} /><strong>Odgovorna:</strong> {r.responsible || '-'}</div>
                          </div>
                          <div style={{ display:'flex', justifyContent:'space-between', gap:8 }}>
                            <div><TagsOutlined style={{ marginRight: 6 }} /><strong>Kategorija:</strong> {r.category ? <Tag color="#0ea5e9">{r.category}</Tag> : '-'}</div>
                          </div>
                          <div style={{ display:'flex', justifyContent:'space-between', gap:8 }}>
                            <div><CarOutlined style={{ marginRight: 6 }} /><strong>Prevoznik:</strong> {r.carrier || '-'}</div>
                            <div><CalendarOutlined style={{ marginRight: 6 }} /><strong>Pickup:</strong> {r.pickup_date ? new Date(r.pickup_date).toLocaleDateString() : '-'}</div>
                          </div>
                          <div style={{ display:'flex', justifyContent:'space-between', gap:8 }}>
                            <div><DollarCircleOutlined style={{ marginRight: 6 }} /><strong>Roba:</strong> {fmtEUR((r as any).goods_cost)}</div>
                            <div><DollarCircleOutlined style={{ marginRight: 6 }} /><strong>Prevoz:</strong> {fmtEUR((r as any).freight_cost)}</div>
                          </div>
                        </Space>
                        <div style={{ marginTop: 8, display:'flex', justifyContent:'space-between', gap:8, flexWrap:'wrap' }}>
                          <Space size={6} wrap>
                            <Popover placement="bottomLeft" content={
                              <Space direction="vertical" size={4}>
                                <div><AuditOutlined style={{ marginRight: 6 }} /><strong>Tip:</strong> <Tag>{r.type || r.transport_type || '-'}</Tag></div>
                                <div><IdcardOutlined style={{ marginRight: 6 }} /><strong>Tablice:</strong> {r.plate || '-'}</div>
                                <div><UserOutlined style={{ marginRight: 6 }} /><strong>Vozač:</strong> {r.driver || '-'}</div>
                                <div><FileTextOutlined style={{ marginRight: 6 }} /><strong>Napomena:</strong> {r.note || '-'}</div>
                              </Space>
                            }>
                              <Button size="small">Detalji</Button>
                            </Popover>
                            <Button size="small" onClick={()=> onEdit(r)}>Izmijeni</Button>
                            <Button size="small" onClick={()=> openDocs(r.id)}>Dokumenti</Button>
                          </Space>
                          <Popconfirm title="Obrisati pošiljku?" okText="Da" cancelText="Ne" onConfirm={()=> onDelete(r)}>
                            <Button size="small" className="btn-danger-invert">Obriši</Button>
                          </Popconfirm>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            </Col>
          );
        })}
      </Row>

      <Modal open={open} onCancel={()=> setOpen(false)} onOk={onSubmit} title={editing? `Uredi #${editing.id}` : 'Novi dolazak'} destroyOnHidden>
        <Form form={form} className="arrivals-form" layout="vertical" size="small" preserve={false} initialValues={{ status:'not_shipped', type:'truck' }}>
          {/* Redosled: Dobavljač, Status, Pickup, ETA, Lokacija, Odgovorna, Prevoznik, Cijena robe, Cijena prevoza */}
          <Form.Item name="supplier" label="Dobavljač" rules={[{ required: true, message: 'Obavezno' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="status" label="Status" rules={[{ required: true }]}>
            <Select options={[{ value: 'not_shipped', label: 'Najavljeno' },{ value: 'shipped', label: 'U transportu' },{ value: 'arrived', label: 'Stiglo' }]} />
          </Form.Item>
          <Form.Item name="pickup_date" label="Pickup">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="eta" label="ETA">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="category" label="Kategorija">
            <Select allowClear showSearch options={CATEGORY_OPTIONS.map(v=> ({ value: v, label: v }))} />
          </Form.Item>
          <Form.Item name="location" label="Lokacija">
            <Select allowClear showSearch options={LOCATION_OPTIONS.map(v=> ({ value: v, label: v }))} />
          </Form.Item>
          <Form.Item name="responsible" label="Odgovorna osoba">
            <Select allowClear showSearch options={RESPONSIBLE_OPTIONS.map(v=> ({ value: v, label: v }))} />
          </Form.Item>
          <Form.Item name="carrier" label="Prevoznik"><Input /></Form.Item>
          <Form.Item name="goods_cost" label="Cijena robe">
            <InputNumber min={0} step={0.01} style={{ width: '100%' }} prefix="€" />
          </Form.Item>
          <Form.Item name="freight_cost" label="Cijena prevoza">
            <InputNumber min={0} step={0.01} style={{ width: '100%' }} prefix="€" />
          </Form.Item>
          {/* Sekundarna polja */}
          <Form.Item name="type" label="Tip">
            <Select options={[{ value:'truck', label:'Šleper' }, { value:'container', label:'Kontejner' }, { value:'van', label:'Kombi' }, { value:'other', label:'Ostalo' }]} />
          </Form.Item>
          <Form.Item name="plate" label="Tablice"><Input /></Form.Item>
          <Form.Item name="driver" label="Vozač"><Input /></Form.Item>
          <Form.Item name="note" label="Napomena"><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>

      {/* Dokumenti modal */}
      <Modal
        open={filesModalId != null}
        title={filesModalId ? `Dokumenti #${filesModalId}` : 'Dokumenti'}
        onCancel={()=> { setFilesModalId(null); setFilesList([]); }}
        footer={null}
        width={600}
      >
        <div style={{ display:'flex', gap:12 }}>
          <div style={{ flex:'0 0 260px' }}>
            <div style={{ display:'flex', flexDirection:'column', gap: 8, marginBottom: 8 }}>
              <input type="file" multiple onChange={(e)=> uploadDoc(filesModalId as number, e.target.files)} />
              <Input.Search placeholder="Pretraga dokumenata…" allowClear value={docsQuery} onChange={(e)=> setDocsQuery(e.target.value)} />
              <Space style={{ display:'flex', justifyContent:'space-between' }}>
                <Select size="small" value={docsSort} onChange={(v)=> setDocsSort(v)} style={{ width: 180 }} options={[
                  { value:'date_desc', label:'Datum: najnoviji' },
                  { value:'date_asc',  label:'Datum: najstariji' },
                  { value:'name_asc',  label:'Naziv: A→Z' },
                  { value:'name_desc', label:'Naziv: Z→A' },
                ]}/>
                {selectedFile && (
                  <a href={`${API_BASE}${selectedFile.url || ''}`} download>
                    <Button>Preuzmi</Button>
                  </a>
                )}
                <Button type="primary" onClick={()=> { setFilesModalId(null); setFilesList([]); setSelectedFile(null); }}>Sačuvaj</Button>
              </Space>
            </div>
            <List
              loading={filesLoading}
              dataSource={filteredFiles}
              renderItem={(f)=> (
                <List.Item
                  onClick={()=> showPreview(f)}
                  style={{ cursor:'pointer' }}
                  actions={[
                    <a key="del" onClick={(e)=>{ e.stopPropagation(); filesModalId && deleteDoc(filesModalId, f.id); }} style={{ color:'#ff4d4f' }}>Obriši</a>,
                  ]}
                >
                  <List.Item.Meta
                    title={f.filename}
                    description={f.created_at ? new Date(f.created_at).toLocaleString() : ''}
                  />
                </List.Item>
              )}
            />
          </div>
          <div
            style={{ flex:'1 1 auto', minHeight: 360, border:'1px dashed #d9d9d9', borderRadius:8, padding:8, overflow:'auto', background:'#fafafa' }}
            onDragOver={(e)=> { e.preventDefault(); }}
            onDrop={(e)=> { e.preventDefault(); const files = e.dataTransfer.files; filesModalId && uploadDoc(filesModalId, files); }}
          >
            {previewLoading ? (
              <div style={{ color:'#999' }}>Učitavanje pregleda…</div>
            ) : selectedFile ? (
              previewType === 'image' ? (
                <img src={`${API_BASE}${selectedFile.url || ''}`} alt={selectedFile.filename} style={{ maxWidth:'100%' }} />
              ) : previewType === 'pdf' ? (
                <iframe src={`${API_BASE}${selectedFile.url || ''}`} title="pdf" style={{ width:'100%', height:500, border:'none' }} />
              ) : (
                <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
              )
            ) : (
              <div style={{ color:'#999', textAlign:'center', paddingTop: 80 }}>
                <div style={{ fontSize: 48, opacity: .15 }}>📄</div>
                <div>Odaberite dokument za pregled</div>
                <div style={{ marginTop: 6, fontSize: 12 }}>ili prevucite fajlove ovdje za upload</div>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </Space>
  );
}
