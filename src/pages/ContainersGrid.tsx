import React from 'react';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';
import { api } from '../lib/api';
import { Button, Space, Input, Select, message, DatePicker } from 'antd';
const { RangePicker } = DatePicker as any;
import type { ColDef } from 'ag-grid-community';
import dayjs from 'dayjs';

type Row = Record<string, any> & {
  id?: number | string;
  supplier?: string;
  proforma_no?: string;
  etd?: string;
  delivery?: string;
  eta?: string;
  cargo_qty?: number;
  cargo?: string;
  container_no?: string;
  roba?: string;
  contain_price?: number | string;
  agent?: string;
  total?: number | string;
  deposit?: number | string;
  balance?: number | string;
  paid?: boolean;
};

export default function ContainersGridPage() {
  const [rows, setRows] = React.useState<Row[]>([]);
  const [loading, setLoading] = React.useState(false);
  const gridRef = React.useRef<any>(null);
  const colApiRef = React.useRef<any>(null);
  const [pageSize, setPageSize] = React.useState<number>(20);
  const [quick, setQuick] = React.useState<string>('');
  const COL_STATE_KEY = 'containersGrid.colState.v1';
  const QUICK_KEY = 'containersGrid.quick.v1';
  const PAGE_KEY = 'containersGrid.page.v1';
  const PAGESIZE_KEY = 'containersGrid.pageSize.v1';
  const VIEWS_KEY = 'containersGrid.views.v1';
  const SERVER_MODE = !!((import.meta as any)?.env?.VITE_GRID_SERVER);
  const [sortModel, setSortModel] = React.useState<any[]>([]);
  const [filterModel, setFilterModel] = React.useState<Record<string, any>>({});
  const [views, setViews] = React.useState<Record<string, any>>(() => {
    try { return JSON.parse(localStorage.getItem(VIEWS_KEY) || '{}'); } catch { return {}; }
  });
  const [selectedView, setSelectedView] = React.useState<string>('');
  const [dateField, setDateField] = React.useState<'eta'|'etd'>('eta');
  const [dateRange, setDateRange] = React.useState<any>(null);

  async function fetchServer() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (quick) params.set('q', quick);
      // filters mapping (paid, eta range)
      const fm = filterModel || {};
      const paidF = fm.paid;
      if (paidF && paidF.filter != null) {
        const val = String(paidF.filter).toLowerCase();
        if (val === 'true' || val === '1') params.set('status', 'paid');
        if (val === 'false' || val === '0') params.set('status', 'unpaid');
      }
      // Prefer explicit toolbar date range if set
      if (dateRange) {
        const from = dateRange[0]?.format('YYYY-MM-DD');
        const to = dateRange[1]?.format('YYYY-MM-DD');
        if (from) params.set('from', from);
        if (to) params.set('to', to);
        params.set('date_field', dateField);
      } else {
        const etaF = fm.eta;
        if (etaF && etaF.type === 'inRange') {
          if (etaF.dateFrom) params.set('from', etaF.dateFrom);
          if (etaF.dateTo) params.set('to', etaF.dateTo);
          params.set('date_field', 'eta');
        }
        const etdF = fm.etd;
        if (etdF && etdF.type === 'inRange') {
          if (etdF.dateFrom) params.set('from', etdF.dateFrom);
          if (etdF.dateTo) params.set('to', etdF.dateTo);
          params.set('date_field', 'etd');
        }
      }
      // sorting (take primary sort)
      const sm = (sortModel || [])[0];
      if (sm) {
        params.set('sort_by', sm.colId);
        params.set('sort_dir', sm.sort === 'asc' ? 'asc' : 'desc');
      }
      // pagination
      try {
        const api = gridRef.current?.api;
        const page = (api?.paginationGetCurrentPage?.() || 0) + 1;
        const per = pageSize || 20;
        params.set('page', String(page));
        params.set('per_page', String(per));
      } catch {}
      const url = `/api/containers${params.toString() ? `?${params.toString()}` : ''}`;
      const res = await fetch(url, { headers: { Accept:'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setRows(data);
      } else if (data && Array.isArray(data.items)) {
        setRows(data.items);
        // optionally sync pagination if server changed it
      } else {
        setRows([]);
      }
    } catch (e) {
      // fallback
      try {
        const data = await api.listContainers();
        setRows(Array.isArray(data) ? data : []);
      } catch {}
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    (async () => {
      if (SERVER_MODE) {
        await fetchServer();
      } else {
        setLoading(true);
        try {
          const data = await api.listContainers();
          setRows(Array.isArray(data) ? data : []);
        } finally { setLoading(false); }
      }
    })();
  }, [SERVER_MODE]);

  // --- Persist quick filter state ---
  React.useEffect(() => {
    try { localStorage.setItem(QUICK_KEY, quick || ''); } catch {}
  }, [quick]);

  const defaultColDef = React.useMemo(() => ({ sortable: true, filter: true, resizable: true, floatingFilter: true }), []);

  const fmtMoney = (v: any) => {
    const n = Number(v ?? 0);
    return n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  const fmtDateEU = (iso?: string) => {
    if (!iso) return '';
    const [y,m,d] = String(iso).split('-');
    if (!y || !m || !d) return iso;
    return `${d}.${m}.${y.slice(2)}`;
  };

  const togglePaid = async (row: Row) => {
    try {
      await api.setContainerPaid(Number(row.id as any), !row.paid);
      const fresh = await api.getContainer(Number(row.id as any));
      if ((fresh as any)?.ok && (fresh as any).data) {
        qc.setQueryData(['containers', Number(row.id)], (old: any) => ({ ...(old || {}), ...(fresh as any).data }));
      }
      if ((fresh as any)?.ok && (fresh as any).data) {
        const d: any = (fresh as any).data;
        setRows(prev => prev.map(r => r.id == row.id ? { ...r, ...d } : r));
      } else {
        setRows(prev => prev.map(r => r.id == row.id ? { ...r, paid: !row.paid } : r));
      }
      message.success('Status plaćanja sačuvan');
    } catch (e) {
      message.error('Nije moguće promijeniti status plaćanja');
    }
  };

  const onCellValueChanged = async (p: any) => {
    const field: string = p.colDef.field;
    if (!field) return;
    const id = Number(p.data?.id);
    if (!id) return;
    const val = p.newValue;
    // Build minimal patch
    let patch: any = {};
    if (['total','deposit','contain_price','balance'].includes(field)) {
      let num = val === '' || val === null || val === undefined ? 0 : Number(val);
      if (Number.isNaN(num)) num = 0;
      if (num < 0) { num = 0; message.warning('Vrijednost ne može biti negativna. Postavljeno na 0.'); }
      patch[field] = num;
    } else {
      patch[field] = val ?? '';
    }
    try {
      await api.updateContainer(id as any, patch);
      // Fetch fresh to reflect auto-balance, etc.
      const fresh = await api.getContainer(id as any);
      if ((fresh as any)?.ok && (fresh as any).data) {
        qc.setQueryData(['containers', Number(id)], (old: any) => ({ ...(old || {}), ...(fresh as any).data }));
      }
      if ((fresh as any)?.ok && (fresh as any).data) {
        const d: any = (fresh as any).data;
        setRows(prev => prev.map(r => r.id === id ? { ...r, ...d } : r));
      }
      message.success('Sačuvano');
    } catch (e) {
      message.error('Greška pri čuvanju');
      // revert UI to old value
      p.node.setDataValue(field, p.oldValue);
    }
  };

  // --- Custom Date editor using AntD DatePicker (edits YYYY-MM-DD strings) ---
  const DateEditor = React.forwardRef<any, any>((props, ref) => {
    const initial = props.value ? dayjs(props.value) : null;
    const [val, setVal] = React.useState<any>(initial);
    React.useImperativeHandle(ref, () => ({
      getValue: () => (val ? val.format('YYYY-MM-DD') : ''),
    }));
    return (
      <DatePicker
        autoFocus
        value={val}
        onChange={(d)=> setVal(d)}
        style={{ width: '100%' }}
        allowClear
        placeholder="YYYY-MM-DD"
      />
    );
  });

  const cols = React.useMemo(() => ([
    { field: 'id', headerName: '#', width: 80 } as ColDef,
    { field: 'supplier', headerName: 'Dobavljač', minWidth: 140, editable: true },
    { field: 'proforma_no', headerName: 'Proforma', width: 110, editable: true },
    { field: 'etd', headerName: 'ETD', width: 120, editable: true, cellEditor: DateEditor as any, valueFormatter: (p:any)=> fmtDateEU(p.value) },
    { field: 'delivery', headerName: 'Delivery', width: 120, editable: true, cellEditor: DateEditor as any, valueFormatter: (p:any)=> fmtDateEU(p.value) },
    { field: 'eta', headerName: 'ETA', width: 120, editable: true, cellEditor: DateEditor as any, valueFormatter: (p:any)=> fmtDateEU(p.value) },
    { field: 'cargo_qty', headerName: 'Qty', width: 90, type: 'rightAligned', editable: true },
    { field: 'cargo', headerName: 'Tip', minWidth: 110, editable: true },
    { field: 'container_no', headerName: 'Kontejner', minWidth: 140, editable: true },
    { field: 'roba', headerName: 'Roba', minWidth: 140, editable: true },
    { field: 'contain_price', headerName: 'Cijena', width: 120, type: 'rightAligned', editable: true, valueFormatter: (p:any)=> fmtMoney(p.value) },
    { field: 'agent', headerName: 'Agent', minWidth: 120, editable: true },
    { field: 'total', headerName: 'Total', width: 120, type: 'rightAligned', editable: true, valueFormatter: (p:any)=> fmtMoney(p.value) },
    { field: 'deposit', headerName: 'Depozit', width: 120, type: 'rightAligned', editable: true, valueFormatter: (p:any)=> fmtMoney(p.value) },
    { field: 'balance', headerName: 'Balans', width: 120, type: 'rightAligned', editable: true, valueFormatter: (p:any)=> fmtMoney(p.value) },
    { field: 'paid', headerName: 'Plaćeno', width: 130, filter: true, cellRenderer: (p:any)=> {
        const isPaid = !!p.value;
        return (
          <Button size="small" shape="round" type={isPaid? 'primary':'default'} style={{ background: isPaid? '#198754':'', borderColor: isPaid? '#198754':'' }} onClick={() => togglePaid(p.data)}>
            {isPaid? 'Plaćeno':'Nije plaćeno'}
          </Button>
        );
      }
    },
  ]), []);

  return (
    <div style={{ width: '100%', height: 'calc(100vh - 160px)', pointerEvents: loading ? 'none' : 'auto' }}>
      <Space style={{ marginBottom: 8, display:'flex', justifyContent:'space-between', flexWrap:'wrap' }}>
        <Space>
          <Input placeholder="Brza pretraga" allowClear value={quick} onChange={(e)=>{ const v = e.target.value; setQuick(v); gridRef.current?.api?.setQuickFilter(v || ''); }} style={{ width: 240 }} />
          <Select value={pageSize} onChange={(v)=>{ const n = Number(v); setPageSize(n); gridRef.current?.api?.paginationSetPageSize(n); try { localStorage.setItem(PAGESIZE_KEY, String(n)); } catch {} }} style={{ width: 120 }} options={[{value:10,label:'10/str'},{value:20,label:'20/str'},{value:50,label:'50/str'}]} />
          <Select value={dateField} onChange={(v)=> setDateField(v as any)} style={{ width: 120 }} options={[{value:'eta',label:'ETA'},{value:'etd',label:'ETD'}]} />
          <RangePicker onChange={(vals:any)=>{ setDateRange(vals); if (SERVER_MODE) fetchServer(); }} allowEmpty={[true,true]} />
        </Space>
        <Space>
          <Button onClick={()=> gridRef.current?.api?.exportDataAsCsv({ fileName: `containers_${new Date().toISOString().slice(0,10)}.csv` })}>Export CSV</Button>
          <Button onClick={async ()=>{
            try {
              const xlsx = await import(/* @vite-ignore */ 'xlsx');
              const wb = xlsx.utils.book_new();
              const ws = xlsx.utils.json_to_sheet(rows);
              xlsx.utils.book_append_sheet(wb, ws, 'Containers');
              const wbout = xlsx.write(wb, { type: 'array', bookType: 'xlsx' });
              const blob = new Blob([wbout], { type: 'application/octet-stream' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = `containers_${new Date().toISOString().slice(0,10)}.xlsx`;
              document.body.appendChild(a); a.click(); a.remove();
            } catch (e) {
              message.error('Ne mogu izvesti XLSX (xlsx modul nije dostupan).');
            }
          }}>Export XLSX</Button>
          <Select placeholder="Sačuvane definicije" style={{ width: 180 }} value={selectedView || undefined} onChange={(v)=>{
            setSelectedView(v);
            try {
              const view = (views as any)[v];
              if (!view) return;
              if (view.columnState) colApiRef.current?.applyColumnState({ state: view.columnState, applyOrder: true });
              if (view.pageSize) { setPageSize(view.pageSize); gridRef.current?.api?.paginationSetPageSize(view.pageSize); }
            } catch {}
          }} options={Object.keys(views||{}).map(k=>({label:k, value:k}))} />
          <Button onClick={()=>{
            const name = prompt('Naziv pogleda:');
            if (!name) return;
            try {
              const state = colApiRef.current?.getColumnState();
              const view = { columnState: state, pageSize };
              const next = { ...(views||{}), [name]: view };
              setViews(next);
              localStorage.setItem(VIEWS_KEY, JSON.stringify(next));
              setSelectedView(name);
            } catch {}
          }}>Sačuvaj pogled</Button>
          <Button danger onClick={()=>{
            if (!selectedView) return;
            const next = { ...(views||{}) }; delete (next as any)[selectedView];
            setViews(next); setSelectedView('');
            localStorage.setItem(VIEWS_KEY, JSON.stringify(next));
          }}>Obriši pogled</Button>
        </Space>
      </Space>
      <div className="ag-theme-quartz" style={{ width: '100%', height: '100%' }}>
        <AgGridReact
          ref={gridRef}
          rowData={rows}
          columnDefs={cols as any}
          defaultColDef={defaultColDef as any}
          animateRows
          pagination={!SERVER_MODE || !(import.meta as any)?.env?.VITE_GRID_SERVER_ROW}
          paginationPageSize={pageSize}
          rowModelType={SERVER_MODE && (import.meta as any)?.env?.VITE_GRID_SERVER_ROW ? 'infinite' as any : undefined}
          cacheBlockSize={pageSize}
          datasource={SERVER_MODE && (import.meta as any)?.env?.VITE_GRID_SERVER_ROW ? {
            getRows: async (params: any) => {
              try {
                const startRow = params.startRow || 0;
                const endRow = params.endRow || pageSize;
                const per = (endRow - startRow) || pageSize;
                const page = Math.floor(startRow / per) + 1;
                const sort = params.sortModel?.[0];
                const fmodel = params.filterModel || {};

                const qs = new URLSearchParams();
                if (quick) qs.set('q', quick);
                if (sort) { qs.set('sort_by', sort.colId); qs.set('sort_dir', sort.sort === 'asc' ? 'asc' : 'desc'); }
                qs.set('page', String(page));
                qs.set('per_page', String(per));
                // Paid filter
                if (fmodel.paid && fmodel.paid.filter != null) {
                  const val = String(fmodel.paid.filter).toLowerCase();
                  if (val==='true'||val==='1') qs.set('status','paid');
                  if (val==='false'||val==='0') qs.set('status','unpaid');
                }
                // Date filter preference: toolbar range first
                if (dateRange) {
                  const from = dateRange[0]?.format('YYYY-MM-DD');
                  const to = dateRange[1]?.format('YYYY-MM-DD');
                  if (from) qs.set('from', from);
                  if (to) qs.set('to', to);
                  qs.set('date_field', dateField);
                }
                const res = await fetch(`/api/containers?${qs.toString()}`, { headers: { Accept:'application/json' } });
                if (!res.ok) throw new Error(String(res.status));
                const data = await res.json();
                const items = Array.isArray(data) ? data : (data.items || []);
                const lastRow = Array.isArray(data) ? (startRow + items.length) : (data.total ?? -1);
                params.successCallback(items, lastRow);
              } catch (e) {
                params.failCallback();
              }
            }
          } : undefined}
          suppressCellFocus
          rowSelection="multiple"
          onGridReady={(params:any)=>{
            colApiRef.current = params.columnApi;
            try {
              const raw = localStorage.getItem(COL_STATE_KEY);
              if (raw) {
                const st = JSON.parse(raw);
                params.columnApi.applyColumnState({ state: st, applyOrder: true });
              }
            } catch {}
            try {
              const ps = Number(localStorage.getItem(PAGESIZE_KEY) || '');
              if (!Number.isNaN(ps) && ps > 0) {
                setPageSize(ps);
                params.api.paginationSetPageSize(ps);
              } else if (pageSize) {
                params.api.paginationSetPageSize(pageSize);
              }
            } catch {
              if (pageSize) params.api.paginationSetPageSize(pageSize);
            }
            try {
              const savedQuick = localStorage.getItem(QUICK_KEY) || '';
              if (savedQuick) {
                setQuick(savedQuick);
                params.api.setQuickFilter(savedQuick);
              }
            } catch {}
            try {
              const p = Number(localStorage.getItem(PAGE_KEY) || '');
              if (!Number.isNaN(p) && p >= 0) {
                setTimeout(()=> params.api.paginationGoToPage(p), 0);
              }
            } catch {}
            if (SERVER_MODE) fetchServer();
          }}
          onCellValueChanged={onCellValueChanged}
          onSortChanged={(e:any)=>{ const m = e.api.getSortModel?.() || []; setSortModel(m); if (SERVER_MODE) fetchServer(); }}
          onFilterChanged={(e:any)=>{ const fm = e.api.getFilterModel?.() || {}; setFilterModel(fm); if (SERVER_MODE) fetchServer(); }}
          onColumnMoved={()=>{ try { const st = colApiRef.current?.getColumnState(); localStorage.setItem(COL_STATE_KEY, JSON.stringify(st)); } catch {} }}
          onColumnVisible={()=>{ try { const st = colApiRef.current?.getColumnState(); localStorage.setItem(COL_STATE_KEY, JSON.stringify(st)); } catch {} }}
          onColumnPinned={()=>{ try { const st = colApiRef.current?.getColumnState(); localStorage.setItem(COL_STATE_KEY, JSON.stringify(st)); } catch {} }}
          onColumnResized={()=>{ try { const st = colApiRef.current?.getColumnState(); localStorage.setItem(COL_STATE_KEY, JSON.stringify(st)); } catch {} }}
          onPaginationChanged={(e:any)=>{ try { const idx = e.api.paginationGetCurrentPage(); localStorage.setItem(PAGE_KEY, String(idx)); } catch {} }}
          loadingOverlayComponentParams={{ loadingMessage: 'Učitavanje…' }}
          overlayLoadingTemplate={`<span class="ag-overlay-loading-center">Učitavanje…</span>`}
        />
      </div>
    </div>
  );
}
