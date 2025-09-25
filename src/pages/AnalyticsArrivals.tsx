import React from 'react';
import { Card, Row, Col, Segmented, DatePicker, Space, Select, Statistic, Table, Modal, Button, message, Switch } from 'antd';
import { API_BASE, apiGET } from '../api/client';
// Recharts removed (migrated to ECharts)
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import { BulbOutlined, CloudDownloadOutlined } from '@ant-design/icons';
import { useUIStore } from '../store';
import { realtime } from '../lib/realtime';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { exportCSV as exportCSVUtil } from '../utils/exports';

type BreakdownItem = {
  label: string;
  count: number;
  total_value: number;
  avg_delay_days: number;
  on_time_rate: number;
  scheduled_samples?: number;
};

const euroFormatter = new Intl.NumberFormat('sr-RS', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2,
});

function formatCurrency(value: number | undefined | null): string {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return '€0,00';
  return euroFormatter.format(num);
}

function formatPercent(value: number | undefined | null): string {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return '0%';
  return `${Math.round(num * 100)}%`;
}

function formatDelayDays(value: number | undefined | null): string {
  const num = Number(value || 0);
  if (!Number.isFinite(num) || Math.abs(num) < 0.05) {
    return '0.0';
  }
  return num.toFixed(1);
}

function buildBreakdownChart(
  items: BreakdownItem[],
  textColor: string,
  gridColor: string,
  color: string,
): echarts.EChartsOption {
  if (!items || items.length === 0) {
    return {
      title: {
        text: 'Nema podataka za zadati period',
        left: 'center',
        top: 'middle',
        textStyle: { color: '#9ca3af', fontSize: 14 },
      },
    };
  }
  const topItems = items.slice(0, 8);
  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        if (!params || !params.length) return '';
        const datum = params[0].data;
        const total = formatCurrency(datum.value);
        const count = datum.count ?? 0;
        const onTime = formatPercent(datum.onTimeRate ?? 0);
        return `
          <div style="display:flex;flex-direction:column;gap:4px;">
            <strong>${datum.name}</strong>
            <span>Ukupno: ${total}</span>
            <span>Dolazaka: ${count}</span>
            <span>On-time: ${onTime}</span>
          </div>
        `;
      },
    },
    grid: { left: 140, right: 32, top: 20, bottom: 24 },
    xAxis: {
      type: 'value',
      axisLabel: {
        color: textColor,
        formatter: (v: number) => formatCurrency(v),
      },
      splitLine: { lineStyle: { color: gridColor, opacity: 0.3 } },
    },
    yAxis: {
      type: 'category',
      data: topItems.map((item) => item.label),
      axisLabel: { color: textColor },
    },
    series: [
      {
        type: 'bar',
        data: topItems.map((item) => ({
          value: Number(item.total_value || 0),
          count: item.count,
          onTimeRate: item.on_time_rate,
          name: item.label,
        })),
        itemStyle: {
          color,
          borderRadius: [0, 6, 6, 0],
        },
        label: {
          show: true,
          position: 'right',
          formatter: (d: any) => `${d.data.count ?? 0}×`,
          color: textColor,
        },
      },
    ],
  };
}

function makeBreakdownColumns(labelTitle: string) {
  return [
    { title: labelTitle, dataIndex: 'label', key: 'label' },
    { title: 'Dolazaka', dataIndex: 'count', key: 'count', align: 'right' as const },
    {
      title: 'Ukupna vrijednost',
      dataIndex: 'total_value',
      key: 'total_value',
      align: 'right' as const,
      render: (v: number) => formatCurrency(v),
    },
    {
      title: 'Prosječno kašnjenje (dani)',
      dataIndex: 'avg_delay_days',
      key: 'avg_delay_days',
      align: 'right' as const,
      render: (v: number) => formatDelayDays(v),
    },
    {
      title: 'On-time %',
      dataIndex: 'on_time_rate',
      key: 'on_time_rate',
      align: 'right' as const,
      render: (v: number) => formatPercent(v),
    },
  ];
}

export default function AnalyticsArrivals() {
  const dark = useUIStore(s => s.darkMode);
  const setDark = useUIStore(s => s.setDarkMode);
  // Default: current year window
  const yInit = new Date().getFullYear();
  const [from, setFrom] = React.useState<string>(`${yInit}-01-01`);
  const [to, setTo] = React.useState<string>(`${yInit}-12-31`);
  const [yearSel, setYearSel] = React.useState<number>(yInit);
  const [period, setPeriod] = React.useState<'year'|'prevYear'|'q1'|'q2'|'q3'|'q4'|'30d'|'90d'|'180d'|'1y'|'all'|'custom'>('year');
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const applyPreset = React.useCallback((mode: typeof period) => {
    setPeriod(mode);
    if (mode === 'all') { setFrom(''); setTo(''); return; }
    if (mode === 'year' || mode === 'prevYear') {
      const y = mode==='prevYear' ? (yearSel || new Date().getFullYear()) - 1 : (yearSel || new Date().getFullYear());
      setFrom(`${y}-01-01`); setTo(`${y}-12-31`); return;
    }
    if (mode === 'q1' || mode === 'q2' || mode === 'q3' || mode === 'q4') {
      const y = yearSel || new Date().getFullYear();
      const ranges: Record<string,[string,string]> = {
        q1:[`${y}-01-01`,`${y}-03-31`], q2:[`${y}-04-01`,`${y}-06-30`], q3:[`${y}-07-01`,`${y}-09-30`], q4:[`${y}-10-01`,`${y}-12-31`]
      };
      const [f,t] = ranges[mode]; setFrom(f); setTo(t); return;
    }
    const now = new Date();
    const toD = fmt(now);
    const past = new Date(); past.setDate(past.getDate() - (mode==='30d'?30: mode==='90d'?90: mode==='180d'?180:365));
    const fromD = fmt(past); setFrom(fromD); setTo(toD);
  }, [yearSel]);
  const [statusF, setStatusF] = React.useState<string>('');
  const [kpi, setKpi] = React.useState<any>(null);
  const [trend, setTrend] = React.useState<any[]>([]);
  const [structure, setStructure] = React.useState<{goods:number;freight:number;customs:number;total:number;share:{goods:number;freight:number;customs:number}}|null>(null);
  const [supplierF, setSupplierF] = React.useState<string>('');
  const [agentF, setAgentF] = React.useState<string>('');
  const [locationF, setLocationF] = React.useState<string>('');
  const [supplierOpts, setSupplierOpts] = React.useState<string[]>([]);
  const [agentOpts, setAgentOpts] = React.useState<string[]>([]);
  const [locationOpts, setLocationOpts] = React.useState<string[]>([]);
  // Build query string for filters
  const buildQS = React.useCallback(() => {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    if (statusF) qs.set('status', statusF);
    if (supplierF) qs.set('supplier', supplierF);
    if (agentF) qs.set('agent', agentF);
    if (locationF) qs.set('location', locationF);
    return qs.toString();
  }, [from, to, statusF, supplierF, agentF, locationF]);

  const qc = useQueryClient();
  // Realtime invalidation (extra safety; global invalidation is already wired)
  React.useEffect(() => {
    const off = realtime.on((evt) => {
      if (!evt || typeof evt !== 'object') return;
      if ((evt.resource === 'arrivals') || (typeof evt.type === 'string' && evt.type.startsWith('arrivals.')) || (evt.type === 'containers.updated')) {
        qc.invalidateQueries({ queryKey: ['analytics','arrivals'] }).catch(()=>{});
      }
    });
    return () => { try { off?.(); } catch {} };
  }, [qc]);
  React.useEffect(()=>{
    (async ()=>{
      try {
        const d = await fetch(`${API_BASE}/api/analytics/arrivals/lookups`).then(r=>r.json());
        setSupplierOpts(Array.isArray(d?.suppliers)? d.suppliers : []);
        setAgentOpts(Array.isArray(d?.agents)? d.agents : []);
        setLocationOpts(Array.isArray(d?.locations)? d.locations : []);
      } catch {}
    })();
  }, []);

  // Queries (staleTime 2–5 min)
  const filtersKey = React.useMemo(() => ({ from, to, statusF, supplierF, agentF, locationF }), [from, to, statusF, supplierF, agentF, locationF]);
  const qKpi = useQuery({
    queryKey: ['analytics','arrivals','kpi', filtersKey],
    queryFn: async () => {
      const q = buildQS();
      return await fetch(`${API_BASE}/api/analytics/arrivals/kpi${q?`?${q}`:''}`).then(r=>r.json());
    },
    staleTime: 180_000,
  });
  React.useEffect(()=>{ if (qKpi.data) setKpi(qKpi.data); }, [qKpi.data]);

  const qTrendCosts = useQuery({
    queryKey: ['analytics','arrivals','trend-costs', filtersKey],
    queryFn: async () => {
      const q = buildQS();
      const t = await fetch(`${API_BASE}/api/analytics/arrivals/trend-costs?granularity=month${q?`&${q}`:''}`).then(r=>r.json());
      return Array.isArray(t?.items) ? t.items : [];
    },
    staleTime: 180_000,
  });
  React.useEffect(()=>{ if (qTrendCosts.data) setTrend(qTrendCosts.data as any[]); }, [qTrendCosts.data]);

  const qCostStruct = useQuery({
    queryKey: ['analytics','arrivals','cost-structure', filtersKey],
    queryFn: async () => {
      const q = buildQS();
      return await fetch(`${API_BASE}/api/analytics/arrivals/cost-structure${q?`?${q}`:''}`).then(r=>r.json());
    },
    staleTime: 300_000,
  });
  React.useEffect(()=>{ if (qCostStruct.data) setStructure(qCostStruct.data as any); }, [qCostStruct.data]);

  const qCostsSeries = useQuery({
    queryKey: ['analytics','arrivals','costs-series', filtersKey],
    queryFn: async () => {
      const q = buildQS();
      const res = await fetch(`${API_BASE}/api/analytics/costs/series${q?`?${q}`:''}`).then(r=>r.json());
      return Array.isArray(res?.items) ? res.items : [];
    },
    staleTime: 300_000,
  });

  const qStatus = useQuery({
    queryKey: ['analytics','arrivals','trend-status', filtersKey],
    queryFn: async () => {
      const q = buildQS();
      const res = await fetch(`${API_BASE}/api/analytics/arrivals/trend${q?`?${q}`:''}`).then(r=>r.json());
      return Array.isArray(res?.items) ? res.items : [];
    },
    staleTime: 300_000,
  });

  const qTopSup = useQuery({
    queryKey: ['analytics','arrivals','top-suppliers', filtersKey],
    queryFn: async () => {
      const q = buildQS();
      const ts = await fetch(`${API_BASE}/api/analytics/arrivals/top-suppliers${q?`?${q}`:''}`).then(r=>r.json());
      return Array.isArray(ts?.items) ? ts.items : [];
    },
    staleTime: 300_000,
  });

  const qOnTime = useQuery({
    queryKey: ['analytics','arrivals','on-time', filtersKey],
    queryFn: async () => {
      const q = buildQS();
      try { return await apiGET<any>(`/api/analytics/arrivals/on-time${q?`?${q}`:''}`, true); }
      catch { return { buckets: {}, on_time_or_early_rate: 0 }; }
    },
    staleTime: 300_000,
  });

  const qLead = useQuery({
    queryKey: ['analytics','arrivals','lead-time', filtersKey],
    queryFn: async () => {
      const q = buildQS();
      try { return await apiGET<any>(`/api/analytics/arrivals/lead-time${q?`?${q}`:''}`, true); }
      catch { return { avg_days: 0, p95_days: 0 }; }
    },
    staleTime: 300_000,
  });

  const qByCategory = useQuery({
    queryKey: ['analytics','arrivals','by-category', filtersKey],
    queryFn: async () => {
      const q = buildQS();
      const res = await apiGET<{ items?: BreakdownItem[] }>(`/api/analytics/arrivals/by-category${q?`?${q}`:''}`, true).catch(() => ({ items: [] }));
      return Array.isArray(res?.items) ? res.items : [];
    },
    staleTime: 300_000,
  });

  const qByResponsible = useQuery({
    queryKey: ['analytics','arrivals','by-responsible', filtersKey],
    queryFn: async () => {
      const q = buildQS();
      const res = await apiGET<{ items?: BreakdownItem[] }>(`/api/analytics/arrivals/by-responsible${q?`?${q}`:''}`, true).catch(() => ({ items: [] }));
      return Array.isArray(res?.items) ? res.items : [];
    },
    staleTime: 300_000,
  });

  const qByLocation = useQuery({
    queryKey: ['analytics','arrivals','by-location', filtersKey],
    queryFn: async () => {
      const q = buildQS();
      const res = await apiGET<{ items?: BreakdownItem[] }>(`/api/analytics/arrivals/by-location${q?`?${q}`:''}`, true).catch(() => ({ items: [] }));
      return Array.isArray(res?.items) ? res.items : [];
    },
    staleTime: 300_000,
  });

  const qByCarrier = useQuery({
    queryKey: ['analytics','arrivals','by-carrier', filtersKey],
    queryFn: async () => {
      const q = buildQS();
      const res = await apiGET<{ items?: BreakdownItem[] }>(`/api/analytics/arrivals/by-carrier${q?`?${q}`:''}`, true).catch(() => ({ items: [] }));
      return Array.isArray(res?.items) ? res.items : [];
    },
    staleTime: 300_000,
  });

  const qByAgent = useQuery({
    queryKey: ['analytics','arrivals','by-agent', filtersKey],
    queryFn: async () => {
      const q = buildQS();
      const res = await apiGET<{ items?: BreakdownItem[] }>(`/api/analytics/arrivals/by-agent${q?`?${q}`:''}`, true).catch(() => ({ items: [] }));
      return Array.isArray(res?.items) ? res.items : [];
    },
    staleTime: 300_000,
  });

  const statusTrendData = Array.isArray(qStatus.data) ? qStatus.data : [];
  const monthSeries = statusTrendData.length
    ? statusTrendData.map((d:any)=> ({ month: String(d.period||'').slice(0,7), not_shipped: d.not_shipped||0, shipped: d.shipped||0, arrived: d.arrived||0 }))
    : trend.map((d:any)=> ({ month: String(d.period||'').slice(0,7), not_shipped: 0, shipped: 0, arrived: d.total||0 }));
  const pieData = structure ? [
    { name:'Roba', value: structure.goods },
    { name:'Prevoz', value: structure.freight },
    { name:'Carina', value: structure.customs },
  ] : [];
  const pieColors = ['#3b82f6','#22c55e','#f59e0b'];

  const [countView, setCountView] = React.useState<'line'|'bar'>('line');
  const [topSup, setTopSup] = React.useState<any[]>([]);
  const [onTime, setOnTime] = React.useState<any>(null);
  const [lead, setLead] = React.useState<any>(null);
  const byCategory = qByCategory.data ?? [];
  const byResponsible = qByResponsible.data ?? [];
  const byLocation = qByLocation.data ?? [];
  const byCarrier = qByCarrier.data ?? [];
  const byAgent = qByAgent.data ?? [];
  const breakdownPalette = ['#2563eb', '#16a34a', '#f97316', '#7c3aed', '#dc2626'];
  const breakdownSections = React.useMemo(() => ([
    { key: 'category', title: 'Po kategoriji robe', label: 'Kategorija', items: byCategory, color: breakdownPalette[0], loading: qByCategory.isFetching },
    { key: 'responsible', title: 'Po odgovornoj osobi', label: 'Odgovorna osoba', items: byResponsible, color: breakdownPalette[1], loading: qByResponsible.isFetching },
    { key: 'location', title: 'Po lokaciji', label: 'Lokacija', items: byLocation, color: breakdownPalette[2], loading: qByLocation.isFetching },
    { key: 'carrier', title: 'Po prevozniku', label: 'Prevoznik', items: byCarrier, color: breakdownPalette[3], loading: qByCarrier.isFetching },
    { key: 'agent', title: 'Po agentu', label: 'Agent', items: byAgent, color: breakdownPalette[4], loading: qByAgent.isFetching },
  ]), [byCategory, byResponsible, byLocation, byCarrier, byAgent, qByCategory.isFetching, qByResponsible.isFetching, qByLocation.isFetching, qByCarrier.isFetching, qByAgent.isFetching]);

  React.useEffect(()=>{ if (Array.isArray(qTopSup.data)) setTopSup(qTopSup.data); }, [qTopSup.data]);
  React.useEffect(()=>{ if (qOnTime.data) setOnTime(qOnTime.data); }, [qOnTime.data]);
  React.useEffect(()=>{ if (qLead.data) setLead(qLead.data); }, [qLead.data]);
  const [drillOpen, setDrillOpen] = React.useState(false);
  const [drillTitle, setDrillTitle] = React.useState('Detalji');
  const [drillItems, setDrillItems] = React.useState<any[]>([]);
  const refCosts = React.useRef<any>(null);
  const refTrend = React.useRef<any>(null);
  const refPie = React.useRef<any>(null);
  const refTop = React.useRef<any>(null);
  const refOnTime = React.useRef<any>(null);
  const textColor = dark ? '#e5e7eb' : '#334155';
  const gridColor = dark ? '#334155' : '#e5e7eb';
  const bgColor = 'transparent';
  const trendLineOpt = (items: any[]) => ({
    backgroundColor: bgColor, tooltip:{ trigger:'axis' }, grid:{ left:40,right:16,top:24,bottom:28 },
    xAxis:{ type:'category', data: items.map((d:any)=>d.month), axisLine:{ lineStyle:{ color:gridColor } }, axisLabel:{ color:textColor } },
    yAxis:{ type:'value', axisLabel:{ color:textColor }, splitLine:{ lineStyle:{ color:gridColor, opacity:.4 } } },
    legend: { top: 8, right: 8, textStyle:{ color: textColor } },
    series:[
      { name:'Najavljeno', type:'line', smooth:true, stack:'cnt', areaStyle:{}, data: items.map((d:any)=>d.not_shipped||0), color:'#6366f1' },
      { name:'U transportu', type:'line', smooth:true, stack:'cnt', areaStyle:{}, data: items.map((d:any)=>d.shipped||0), color:'#ef4444' },
      { name:'Stiglo', type:'line', smooth:true, stack:'cnt', areaStyle:{}, data: items.map((d:any)=>d.arrived||0), color:'#22c55e' },
    ]
  }) as echarts.EChartsOption;
  const trendBarOpt = (items: any[]) => ({
    backgroundColor: bgColor, tooltip:{ trigger:'axis' }, grid:{ left:40,right:16,top:24,bottom:28 },
    xAxis:{ type:'category', data: items.map((d:any)=>d.month), axisLine:{ lineStyle:{ color:gridColor } }, axisLabel:{ color:textColor } },
    yAxis:{ type:'value', axisLabel:{ color:textColor }, splitLine:{ lineStyle:{ color:gridColor, opacity:.4 } } },
    legend: { top: 8, right: 8, textStyle:{ color: textColor } },
    series:[
      { name:'Najavljeno', type:'bar', stack:'cnt', itemStyle:{ borderRadius:[6,6,0,0], color:'#6366f1' }, data: items.map((d:any)=>d.not_shipped||0) },
      { name:'U transportu', type:'bar', stack:'cnt', itemStyle:{ borderRadius:[6,6,0,0], color:'#ef4444' }, data: items.map((d:any)=>d.shipped||0) },
      { name:'Stiglo', type:'bar', stack:'cnt', itemStyle:{ borderRadius:[6,6,0,0], color:'#22c55e' }, data: items.map((d:any)=>d.arrived||0) },
    ]
  }) as echarts.EChartsOption;
  const pieOpt = (data:any[]) => ({
    backgroundColor: bgColor, tooltip:{ trigger:'item' }, legend:{ top:8,right:8,textStyle:{ color:textColor } },
    series:[{ type:'pie', radius:['60%','80%'], label:{ show:false }, labelLine:{ show:false }, data: data.map((d,i)=>({ name:d.name, value:d.value, itemStyle:{ color: pieColors[i%pieColors.length] } })) }]
  }) as echarts.EChartsOption;
  const topSupOpt = (items:any[]) => ({
    backgroundColor: bgColor,
    tooltip:{ trigger:'axis', axisPointer:{ type:'shadow' }, formatter:(params:any)=>{
      const lines = params.map((p:any)=> `${p.seriesName}: ${p.seriesName==='Ukupno' ? (Number(p.value||0)).toLocaleString('en-GB',{style:'currency',currency:'EUR'}) : Number(p.value||0).toLocaleString('en-GB')}`);
      return `${params[0]?.axisValueLabel||''}<br/>`+lines.join('<br/>');
    } }, grid:{ left:60,right:16,top:16,bottom:24 },
    xAxis:{ type:'category', data: items.map((r:any)=> r.supplier), axisLabel:{ color:textColor, rotate:-20 }, axisLine:{ lineStyle:{ color:gridColor } } },
    yAxis:{ type:'value', axisLabel:{ color:textColor, formatter:(v:any)=> (Number(v||0)).toLocaleString('en-GB',{style:'currency',currency:'EUR'}) }, splitLine:{ lineStyle:{ color:gridColor, opacity:.4 } } },
    series:[{ type:'bar', data: items.map((r:any)=> r.total), itemStyle:{ color:'#22c55e', borderRadius:[6,6,0,0] }, name:'Ukupno' }]
  }) as echarts.EChartsOption;
  const onTimeOpt = (b:any) => ({
    backgroundColor: bgColor, tooltip:{ trigger:'axis' }, grid:{ left:40,right:16,top:16,bottom:24 },
    xAxis:{ type:'category', data:['Early','On time','Late'], axisLabel:{ color:textColor } },
    yAxis:{ type:'value', axisLabel:{ color:textColor }, splitLine:{ lineStyle:{ color:gridColor, opacity:.4 } } },
    series:[{ type:'bar', data:[b?.early||0,b?.on_time||0,b?.late||0], itemStyle:{ color:'#3f5ae0', borderRadius:[6,6,0,0] } }]
  }) as echarts.EChartsOption;

  async function openDrillByMonth(month: string) {
    const qs = new URLSearchParams();
    qs.set('month', month);
    if (statusF) qs.set('status', statusF);
    const data = await apiGET<any>(`/api/analytics/arrivals/list?${qs.toString()}`, true).catch(()=>({items:[]}));
    setDrillItems(Array.isArray(data?.items)? data.items : []);
    setDrillTitle(`Dolazci za ${month}`);
    setDrillOpen(true);
  }
  async function openDrillBySupplier(supplier: string) {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    qs.set('supplier', supplier);
    if (statusF) qs.set('status', statusF);
    if (agentF) qs.set('agent', agentF);
    if (locationF) qs.set('location', locationF);
    const data = await apiGET<any>(`/api/analytics/arrivals/list?${qs.toString()}`, true).catch(()=>({items:[]}));
    setDrillItems(Array.isArray(data?.items)? data.items : []);
    setDrillTitle(`Dolazci – ${supplier}`);
    setDrillOpen(true);
  }
  function exportTrendCSV() { exportCSVUtil(trend.map(d=>({ period:d.period, total:d.total })), 'trend_troskova.csv'); }
  function exportTopSupCSV() { exportCSVUtil(topSup.map((r:any)=>({ supplier:r.supplier, count:r.count, total:r.total, avg_delay_h:r.avg_delay_h })), 'top_dobavljaci.csv'); }
  function exportDrillCSV() { exportCSVUtil(drillItems, 'drill_dolasci.csv'); }

  async function exportXLSX(rows:any[], filename:string) {
    try {
      const XLSX = (await import('xlsx')).default || (await import('xlsx'));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = filename; a.click();
      setTimeout(()=> URL.revokeObjectURL(a.href), 500);
    } catch (e:any) {
      message.error('XLSX export nije dostupan');
    }
  }
  async function exportPDF(rows:any[], columns:{title:string;dataIndex:string}[], filename:string) {
    try {
      const jsPDF = (await import('jspdf')).default;
      await import('jspdf-autotable');
      const doc = new jsPDF();
      const head = [columns.map(c=> c.title)];
      const data = rows.map(r=> columns.map(c=> r[c.dataIndex] ?? ''));
      // @ts-ignore
      doc.autoTable({ head, body: data, styles:{ fontSize:8 } });
      doc.save(filename);
    } catch (e:any) {
      message.error('PDF export nije dostupan');
    }
  }

  return (
    <div style={{ display:'grid', gap:16 }}>
      {/* Info card uklonjen na zahtjev */}
      <Space style={{ marginBottom: 8 }} wrap>
        <Select size="small" value={period} onChange={(v)=>{ if (v==='custom') setPeriod('custom'); else applyPreset(v as any); }}
          options={[
            {value:'year',label:'Aktuelna godina'},
            {value:'prevYear',label:'Prethodna godina'},
            {value:'q1',label:'Q1'},
            {value:'q2',label:'Q2'},
            {value:'q3',label:'Q3'},
            {value:'q4',label:'Q4'},
            {value:'30d',label:'Zadnjih 30d'},
            {value:'90d',label:'Zadnjih 90d'},
            {value:'180d',label:'Zadnjih 180d'},
            {value:'1y',label:'Zadnjih 12m'},
            {value:'all',label:'Svi zapisi'},
            {value:'custom',label:'Custom'},
          ]}
        />
        {(period==='year' || period==='prevYear' || period==='q1' || period==='q2' || period==='q3' || period==='q4') && (
          <DatePicker size="small" picker="year" allowClear={false}
            value={(window as any).dayjs?.(`${yearSel}-01-01`)}
            onChange={(d)=>{ const y = d? Number(d.format('YYYY')): new Date().getFullYear(); setYearSel(y); setTimeout(()=> applyPreset(period==='prevYear' ? 'prevYear' : (period.startsWith('q')? period: 'year') as any), 0); }}
          />
        )}
        {period==='custom' && (
          <>
            <DatePicker size="small" placeholder="Od" value={from? (window as any).dayjs?.(from): null} onChange={(d)=> setFrom(d? d.format('YYYY-MM-DD'): '')} />
            <DatePicker size="small" placeholder="Do" value={to? (window as any).dayjs?.(to): null} onChange={(d)=> setTo(d? d.format('YYYY-MM-DD'): '')} />
          </>
        )}
        <span>
          {from && to ? (
            (period==='year'||period==='prevYear') ? <span style={{color:'#64748b'}}>Godina {period==='prevYear'? yearSel-1: yearSel}</span>
            : (period.startsWith('q')? <span style={{color:'#64748b'}}>{period.toUpperCase()} {yearSel}</span> : <span style={{color:'#64748b'}}>{from} – {to}</span>)
          ) : (
            <span style={{color:'#64748b'}}>Svi zapisi</span>
          )}
        </span>
        <Select allowClear placeholder="Status" value={statusF||undefined} onChange={(v)=> setStatusF(v || '')}
          options={[{value:'not_shipped',label:'Najavljeno'},{value:'shipped',label:'U transportu'},{value:'arrived',label:'Stiglo'}]} />
        <Select
          allowClear
          showSearch
          placeholder="Dobavljač"
          style={{ width: 200 }}
          value={supplierF||undefined}
          onChange={(v)=> setSupplierF(v||'')}
          options={supplierOpts.map(v=>({ value:v, label:v }))}
          filterOption={(input, option)=> (option?.label as string).toLowerCase().includes(input.toLowerCase())}
        />
        <Select
          allowClear
          showSearch
          placeholder="Agent"
          style={{ width: 160 }}
          value={agentF||undefined}
          onChange={(v)=> setAgentF(v||'')}
          options={agentOpts.map(v=>({ value:v, label:v }))}
          filterOption={(input, option)=> (option?.label as string).toLowerCase().includes(input.toLowerCase())}
        />
        <Select
          allowClear
          showSearch
          placeholder="Lokacija"
          style={{ width: 180 }}
          value={locationF||undefined}
          onChange={(v)=> setLocationF(v||'')}
          options={locationOpts.map(v=>({ value:v, label:v }))}
          filterOption={(input, option)=> (option?.label as string).toLowerCase().includes(input.toLowerCase())}
        />
      </Space>
      <Row gutter={[16,16]}>
        <Col xs={24} sm={12} md={6}><Card><Statistic title="Današnji dolasci" value={kpi?.today_count ?? 0} /></Card></Col>
        <Col xs={24} sm={12} md={6}><Card><Statistic title="Na putu" value={kpi?.in_transit ?? 0} /></Card></Col>
        <Col xs={24} sm={12} md={6}><Card><Statistic title="Stiglo" value={kpi?.arrived ?? 0} /></Card></Col>
        <Col xs={24} sm={12} md={6}><Card><Statistic title="Ukupni trošak (mjesec)" value={kpi?.total_cost_month ?? 0} precision={2} prefix="€" /></Card></Col>
      </Row>
      <Row gutter={[16,16]}>
        <Col xs={24} sm={12} md={8}><Card><Statistic title="Suma troškova (period)" value={kpi?.total_cost_window ?? 0} precision={2} prefix="€" /></Card></Col>
        <Col xs={24} sm={12} md={8}><Card><Statistic title="Prosjek po dolasku (period)" value={kpi?.avg_cost_window ?? 0} precision={2} prefix="€" /></Card></Col>
        <Col xs={24} sm={12} md={8}><Card><Statistic title="Dolazaka u periodu" value={kpi?.count_window ?? 0} /></Card></Col>
      </Row>

      <Row gutter={[16,16]}>
        <Col xs={24}>
          <Card title="Troškovi kroz vrijeme (stack + kumulativ)" extra={<Button size="small" icon={<CloudDownloadOutlined />} onClick={()=>{ const ch = refCosts.current?.getEchartsInstance?.(); if(ch){ const url=ch.getDataURL({pixelRatio:2, backgroundColor:'#fff'}); const a=document.createElement('a'); a.href=url; a.download='arrivals_costs_series.png'; a.click(); } }}>Export image</Button>}>
            <div style={{ width:'100%', height: 300 }}>
              <ReactECharts ref={refCosts} option={{
                backgroundColor: bgColor,
                tooltip:{ trigger:'axis', valueFormatter:(v:any)=> (Number(v||0)).toLocaleString('en-GB',{style:'currency',currency:'EUR'}) }, legend:{ top:8,right:8,textStyle:{ color:textColor } }, grid:{ left:60,right:16,top:32,bottom:28 },
                xAxis:{ type:'category', data: (Array.isArray(qCostsSeries.data)? qCostsSeries.data: []).map((d:any)=> String(d.period||'').slice(0,7)), axisLabel:{ color:textColor }, axisLine:{ lineStyle:{ color:gridColor } } },
                yAxis:{ type:'value', axisLabel:{ color:textColor, formatter:(v:any)=> (Number(v||0)).toLocaleString('en-GB',{style:'currency',currency:'EUR'}) }, splitLine:{ lineStyle:{ color:gridColor, opacity:.4 } } },
                series:[
                  { name:'Roba', type:'bar', stack:'cost', itemStyle:{ borderRadius:[6,6,0,0] }, data: (Array.isArray(qCostsSeries.data)? qCostsSeries.data: []).map((d:any)=> d.goods||0), color:'#3b82f6' },
                  { name:'Prevoz', type:'bar', stack:'cost', itemStyle:{ borderRadius:[6,6,0,0] }, data: (Array.isArray(qCostsSeries.data)? qCostsSeries.data: []).map((d:any)=> d.freight||0), color:'#22c55e' },
                  { name:'Carina', type:'bar', stack:'cost', itemStyle:{ borderRadius:[6,6,0,0] }, data: (Array.isArray(qCostsSeries.data)? qCostsSeries.data: []).map((d:any)=> d.customs||0), color:'#f59e0b' },
                  { name:'Kumulativ', type:'line', smooth:true, data: (function(){ const arr=(Array.isArray(qCostsSeries.data)? qCostsSeries.data: []).map((d:any)=> (Number(d.goods||0)+Number(d.freight||0)+Number(d.customs||0))); let run=0; return arr.map(v=> (run+=v)); })(), color:'#111827' },
                ]
              }} style={{ width:'100%', height: 300 }} notMerge lazyUpdate theme={dark? 'dark': undefined} echarts={echarts} />
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16,16]}>
        <Col xs={24} md={14}>
          <Card title={
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
              <span>Status po mjesecima (stack)</span>
              <Segmented size="small" value={countView} onChange={(v)=>setCountView(v as any)} options={[{label:'Area', value:'line'},{label:'Bar', value:'bar'}]} />
            </div>
          } extra={<Space>
            <Button size="small" icon={<CloudDownloadOutlined />} onClick={()=>{ const ch = refTrend.current?.getEchartsInstance?.(); if(ch){ const url=ch.getDataURL({pixelRatio:2, backgroundColor:'#fff'}); const a=document.createElement('a'); a.href=url; a.download='arrivals_trend.png'; a.click(); } }}>Export image</Button>
            <Switch size="small" checkedChildren={<BulbOutlined />} unCheckedChildren={<BulbOutlined />} checked={dark} onChange={setDark} />
          </Space>}>
            <div style={{ width:'100%', height: 280 }}>
              <ReactECharts ref={refTrend} option={countView==='line'? trendLineOpt(monthSeries) : trendBarOpt(monthSeries)} style={{ width:'100%', height: 280 }} notMerge lazyUpdate theme={dark? 'dark': undefined} echarts={echarts} onEvents={{ click:(p:any)=> p?.name && openDrillByMonth(p.name) }} />
              <div style={{ textAlign:'right', marginTop: 8 }}>
                <Space>
                  <Button size="small" onClick={exportTrendCSV}>CSV</Button>
                  <Button size="small" onClick={()=> exportXLSX(trend.map(d=>({ period:d.period, total:d.total })), 'trend_troskova.xlsx')}>XLSX</Button>
                </Space>
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} md={10}>
          <Card title="Struktura troškova (pie)" extra={<Button size="small" icon={<CloudDownloadOutlined />} onClick={()=>{ const ch = refPie.current?.getEchartsInstance?.(); if(ch){ const url=ch.getDataURL({pixelRatio:2, backgroundColor:'#fff'}); const a=document.createElement('a'); a.href=url; a.download='arrivals_cost_pie.png'; a.click(); } }}>Export image</Button>}>
            <div style={{ width:'100%', height: 280 }}>
              <ReactECharts ref={refPie} option={pieOpt(pieData)} style={{ width:'100%', height: 280 }} notMerge lazyUpdate theme={dark? 'dark': undefined} echarts={echarts} />
            </div>
          </Card>
        </Col>
      </Row>

      {/* Top dobavljači i tabelarni prikaz */}
      <Row gutter={[16,16]}>
        <Col xs={24} md={14}>
          <Card title="Top dobavljači (po vrijednosti)" extra={<Space>
            <Button size="small" onClick={exportTopSupCSV}>CSV</Button>
            <Button size="small" onClick={()=> exportXLSX(topSup, 'top_dobavljaci.xlsx')}>XLSX</Button>
            <Button size="small" onClick={()=> exportPDF(topSup, [
              {title:'Dobavljač',dataIndex:'supplier'},
              {title:'Broj',dataIndex:'count'},
              {title:'Ukupno',dataIndex:'total'},
              {title:'Avg kašnjenje (h)',dataIndex:'avg_delay_h'},
            ], 'top_dobavljaci.pdf')}>PDF</Button>
            <Button size="small" icon={<CloudDownloadOutlined />} onClick={()=>{ const ch = refTop.current?.getEchartsInstance?.(); if(ch){ const url=ch.getDataURL({pixelRatio:2, backgroundColor:'#fff'}); const a=document.createElement('a'); a.href=url; a.download='arrivals_top_suppliers.png'; a.click(); } }}>Export image</Button>
          </Space>}>
            <div style={{ width:'100%', height: 320 }}>
              <ReactECharts ref={refTop} option={topSupOpt(topSup)} style={{ width:'100%', height: 320 }} notMerge lazyUpdate theme={dark? 'dark': undefined} echarts={echarts} onEvents={{ click:(p:any)=> p?.name && openDrillBySupplier(p.name) }} />
            </div>
          </Card>
        </Col>
        <Col xs={24} md={10}>
          <Card title="Top dobavljači (tabela)">
            <Table
              size="small"
              rowKey={(r)=>`${r.supplier}-${r.total}`}
              pagination={{ pageSize: 6 }}
              dataSource={topSup}
              columns={[
                { title:'Dobavljač', dataIndex:'supplier', key:'supplier' },
                { title:'Broj', dataIndex:'count', key:'count', align:'right' },
                { title:'Ukupno', dataIndex:'total', key:'total', align:'right', render:(v)=>`€${Number(v).toLocaleString('en-GB',{maximumFractionDigits:2})}` },
                { title:'Avg kašnjenje (h)', dataIndex:'avg_delay_h', key:'avg_delay_h', align:'right', render:(v)=>Number(v).toFixed(1) },
              ]}
            />
          </Card>
        </Col>
      </Row>

      {breakdownSections.map((section) => (
        <Row gutter={[16, 16]} key={section.key}>
          <Col xs={24}>
            <Card title={section.title}>
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <div style={{ width: '100%', height: 280 }}>
                  <ReactECharts
                    option={buildBreakdownChart(section.items, textColor, gridColor, section.color)}
                    style={{ width: '100%', height: 280 }}
                    notMerge
                    lazyUpdate
                    theme={dark ? 'dark' : undefined}
                    echarts={echarts}
                  />
                </div>
                <Table
                  size="small"
                  rowKey={(_, idx) => `${section.key}-${idx}`}
                  pagination={{ pageSize: 6 }}
                  loading={section.loading}
                  dataSource={section.items}
                  columns={makeBreakdownColumns(section.label)}
                  locale={{ emptyText: 'Nema podataka za prikaz' }}
                />
              </Space>
            </Card>
          </Col>
        </Row>
      ))}

      {/* On‑time i Lead‑time KPI + buckets */}
      <Row gutter={[16,16]}>
        <Col xs={24} md={8}><Card><Statistic title="On-time ili ranije" value={onTime ? Math.round((onTime.on_time_or_early_rate||0)*100) : 0} suffix="%" /></Card></Col>
        <Col xs={24} md={8}><Card><Statistic title="Lead time (avg dani)" value={lead?.avg_days || 0} precision={1} /></Card></Col>
        <Col xs={24} md={8}><Card><Statistic title="Lead time (p95 dani)" value={lead?.p95_days || 0} precision={1} /></Card></Col>
      </Row>
      <Modal open={drillOpen} onCancel={()=> setDrillOpen(false)} footer={null} width={900} title={drillTitle}>
        <div style={{ marginBottom: 8, textAlign:'right' }}>
          <Space>
            <Button size="small" onClick={exportDrillCSV}>CSV</Button>
            <Button size="small" onClick={()=> exportXLSX(drillItems, 'drill_dolasci.xlsx')}>XLSX</Button>
            <Button size="small" onClick={()=> exportPDF(drillItems, [
              { title:'#', dataIndex:'id' },
              { title:'Dobavljač', dataIndex:'supplier' },
              { title:'Status', dataIndex:'status' },
              { title:'ETA', dataIndex:'eta' },
              { title:'Stiglo', dataIndex:'arrived_at' },
              { title:'Prevoz €', dataIndex:'freight_cost' },
              { title:'Carina €', dataIndex:'customs_cost' },
              { title:'Roba €', dataIndex:'goods_cost' },
            ], 'drill_dolasci.pdf')}>PDF</Button>
          </Space>
        </div>
        <Table
          size="small"
          rowKey={(r)=>r.id}
          dataSource={drillItems}
          pagination={{ pageSize: 10 }}
          columns={[
            { title: '#', dataIndex:'id', key:'id', width:80 },
            { title: 'Dobavljač', dataIndex:'supplier', key:'supplier' },
            { title: 'Status', dataIndex:'status', key:'status' },
            { title: 'ETA', dataIndex:'eta', key:'eta' },
            { title: 'Stiglo', dataIndex:'arrived_at', key:'arrived_at' },
            { title: 'Prevoz €', dataIndex:'freight_cost', key:'freight_cost', align:'right', render:(v)=>Number(v||0).toLocaleString('en-GB',{minimumFractionDigits:2, maximumFractionDigits:2}) },
            { title: 'Carina €', dataIndex:'customs_cost', key:'customs_cost', align:'right', render:(v)=>Number(v||0).toLocaleString('en-GB',{minimumFractionDigits:2, maximumFractionDigits:2}) },
            { title: 'Roba €', dataIndex:'goods_cost', key:'goods_cost', align:'right', render:(v)=>Number(v||0).toLocaleString('en-GB',{minimumFractionDigits:2, maximumFractionDigits:2}) },
          ]}
        />
      </Modal>
      <Row>
        <Col xs={24}>
          <Card title="On‑time buckets" extra={<Button size="small" icon={<CloudDownloadOutlined />} onClick={()=>{ const ch = refOnTime.current?.getEchartsInstance?.(); if(ch){ const url=ch.getDataURL({pixelRatio:2, backgroundColor:'#fff'}); const a=document.createElement('a'); a.href=url; a.download='arrivals_on_time.png'; a.click(); } }}>Export image</Button>}>
            <div style={{ width:'100%', height: 220 }}>
              <ReactECharts ref={refOnTime} option={onTimeOpt(onTime?.buckets||{})} style={{ width:'100%', height: 220 }} notMerge lazyUpdate theme={dark? 'dark': undefined} echarts={echarts} />
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
