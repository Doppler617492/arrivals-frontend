import React from 'react';
import { Card, Row, Col, Segmented, Space, Button, Switch, DatePicker, Select, Tag } from 'antd';
import { api } from '../lib/api';
import { API_BASE } from '../api/client';
// Recharts removed (migrated to ECharts)
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import { BulbOutlined, CloudDownloadOutlined } from '@ant-design/icons';
import { useUIStore } from '../store';
import { realtime } from '../lib/realtime';

export default function AnalyticsContainers() {
  const [containers, setContainers] = React.useState<any[]>([]);
  const [kpi, setKpi] = React.useState<any>(null);
  const [trend, setTrend] = React.useState<any[]>([]);
  const [topSup, setTopSup] = React.useState<any[]>([]);
  const dark = useUIStore(s => s.darkMode);
  const setDark = useUIStore(s => s.setDarkMode);
  const refTrend = React.useRef<any>(null);
  const refDonut = React.useRef<any>(null);
  const refTop = React.useRef<any>(null);
  // Period filter: year (default current), 30d, 90d, 180d, 1y (rolling), all, custom
  const nowInit = new Date();
  const yInit = nowInit.getFullYear();
  const [period, setPeriod] = React.useState<'year'|'30d'|'90d'|'180d'|'1y'|'all'|'custom'>('year');
  const [dateField, setDateField] = React.useState<'etd'|'eta'|'delivery'|'created_at'>('etd');
  const [from, setFrom] = React.useState<string>(`${yInit}-01-01`);
  const [to, setTo] = React.useState<string>(`${yInit}-12-31`);
  const [yearSel, setYearSel] = React.useState<number>(yInit);
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const applyPreset = React.useCallback((mode: 'year'|'30d'|'90d'|'180d'|'1y'|'all') => {
    setPeriod(mode);
    if (mode === 'all') { setFrom(''); setTo(''); return; }
    if (mode === 'year') {
      const y = yearSel || new Date().getFullYear();
      const fromD = `${y}-01-01`;
      const toD = `${y}-12-31`;
      setFrom(fromD); setTo(toD); return;
    }
    const now = new Date();
    const toD = fmt(now);
    const past = new Date();
    const days = mode==='30d' ? 30 : mode==='90d' ? 90 : mode==='180d' ? 180 : 365;
    past.setDate(past.getDate() - days);
    const fromD = fmt(past);
    setFrom(fromD); setTo(toD);
  }, []);

  // Default is current year via initial state; no need to re-apply here
  React.useEffect(() => {
    async function load() {
      try {
        const c = await api.listContainers().catch(() => [] as any[]);
        setContainers(Array.isArray(c) ? c : []);
        // Load analytics endpoints (best-effort)
        const qs = new URLSearchParams();
        if (from) qs.set('from', from);
        if (to) qs.set('to', to);
        if (dateField) qs.set('date_field', dateField);
        const qstr = qs.toString();
        try {
          const k = await fetch(`${API_BASE}/api/analytics/containers/kpi${qstr?`?${qstr}`:''}`).then(r=>r.json());
          setKpi(k);
        } catch {}
        try {
          const t = await fetch(`${API_BASE}/api/analytics/containers/trend-amounts${qstr?`?${qstr}`:''}`).then(r=>r.json());
          setTrend(Array.isArray(t?.items)? t.items : []);
        } catch {}
        try {
          const ts = await fetch(`${API_BASE}/api/analytics/containers/top-suppliers${qstr?`?${qstr}`:''}`).then(r=>r.json());
          setTopSup(Array.isArray(ts?.items)? ts.items : []);
        } catch {}
      } catch {}
    }
    load();
    const off = realtime.on((evt)=>{
      if (!evt || typeof evt !== 'object') return;
      if ((evt.resource === 'containers') || (typeof evt.type === 'string' && evt.type.startsWith('containers.')) || (evt.type === 'arrivals.updated')) {
        load();
      }
    });
    return () => { try { off?.(); } catch {} };
  }, [from, to, dateField]);

  const moneyToNumber = (v:any) => {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return v;
    const s0 = String(v).trim();
    if (s0.includes('.') && s0.includes(',')) return Number(s0.replace(/\./g,'').replace(/,/g,'.')) || 0;
    if (s0.includes(',')) return Number(s0.replace(/,/g,'.')) || 0;
    return Number(s0) || 0;
  };
  const monthKey = (iso?: string) => (iso || '').slice(0,7) || 'nepoznato';
  const monthMap: Record<string, { month: string; paid: number; unpaid: number; totalAmt: number; }>= {};
  const paidCount = containers.filter((c:any)=> !!(c.paid || c.placeno)).length;
  const unpaidCount = containers.length - paidCount;
  containers.forEach((c:any)=>{
    const k = monthKey(c.eta);
    const paid = !!(c.paid || c.placeno);
    const amt = moneyToNumber(c.total);
    monthMap[k] = monthMap[k] || { month:k, paid:0, unpaid:0, totalAmt:0 };
    monthMap[k][paid ? 'paid' : 'unpaid'] += amt;
    monthMap[k].totalAmt += amt;
  });
  const monthSeriesLocal = Object.values(monthMap).sort((a,b)=> a.month.localeCompare(b.month));
  const monthSeries = trend.length ? trend : monthSeriesLocal;

  // const paidPie = [ { name:'Plaćeni', value: paidCount }, { name:'Neplaćeni', value: unpaidCount } ];
  // const COLORS = ['#22c55e', '#ef4444', '#3f5ae0', '#f59e0b'];
  const supplierTopLocal = Object.entries(containers.reduce((acc:any,c:any)=>{ const k=(c.supplier||'nepoznato'); acc[k]=(acc[k]||0)+1; return acc; },{})).sort((a:any,b:any)=> (b[1]-a[1])).slice(0,10).map(([k,v])=>({supplier:k,count:v as number}));
  const supplierTop = topSup.length ? topSup : supplierTopLocal;

  const [amountView, setAmountView] = React.useState<'area'|'bar'>('area');
  const totalAmt = containers.reduce((s,c)=> s + moneyToNumber(c.total), 0);
  const paidAmtLocal = containers.filter((c:any)=> {
    const s = String((c.status||'')).toLowerCase();
    return !!(c.paid || s==='plaćeno' || s==='placeno' || s==='paid' || s==='uplaćeno' || s==='uplaceno');
  }).reduce((s,c)=> s + moneyToNumber(c.total), 0);
  const unpaidAmtLocal = totalAmt - paidAmtLocal;

  const textColor = dark ? '#e5e7eb' : '#334155';
  const gridColor = dark ? '#334155' : '#e5e7eb';
  const bgColor = 'transparent';
  // Containers should display amounts in USD with EU separators and symbol in front ($ 12.345,67)
  const fmtUSD = (v:number)=> {
    const n = Number(v||0);
    const nf = new Intl.NumberFormat('de-DE', { style:'currency', currency:'USD' });
    const parts = nf.formatToParts(n);
    const cleaned = parts.filter(p => p.type !== 'currency').map(p => p.value).join('').replace(/\s*\$/g,'').trim();
    return `$ ${cleaned}`;
  };
  const trendAreaOpt = (items:any[]) => ({
    backgroundColor: bgColor,
    tooltip:{ trigger:'axis', valueFormatter:(v:any)=> fmtUSD(v as number) }, legend:{ top:8,right:8,textStyle:{ color:textColor } }, grid:{ left:60,right:16,top:32,bottom:28 },
    xAxis:{ type:'category', data: items.map((d:any)=> d.month || d.period), axisLabel:{ color:textColor }, axisLine:{ lineStyle:{ color:gridColor } } },
    yAxis:{ type:'value', axisLabel:{ color:textColor, formatter:(val:any)=> fmtUSD(val as number) }, splitLine:{ lineStyle:{ color:gridColor, opacity:.4 } } },
    series:[ { name:'Plaćeno', type:'line', smooth:true, stack:'amt', areaStyle:{}, data: items.map((d:any)=> d.paid||0), color:'#22c55e' }, { name:'Neplaćeno', type:'line', smooth:true, stack:'amt', areaStyle:{}, data: items.map((d:any)=> d.unpaid||0), color:'#ef4444' } ]
  }) as echarts.EChartsOption;
  const trendBarOpt = (items:any[]) => ({
    backgroundColor: bgColor,
    tooltip:{ trigger:'axis', valueFormatter:(v:any)=> fmtUSD(v as number) }, legend:{ top:8,right:8,textStyle:{ color:textColor } }, grid:{ left:60,right:16,top:32,bottom:28 },
    xAxis:{ type:'category', data: items.map((d:any)=> d.month || d.period), axisLabel:{ color:textColor }, axisLine:{ lineStyle:{ color:gridColor } } },
    yAxis:{ type:'value', axisLabel:{ color:textColor, formatter:(val:any)=> fmtUSD(val as number) }, splitLine:{ lineStyle:{ color:gridColor, opacity:.4 } } },
    series:[ { name:'Plaćeno', type:'bar', stack:'amt', itemStyle:{ borderRadius:[6,6,0,0] }, data: items.map((d:any)=> d.paid||0), color:'#22c55e' }, { name:'Neplaćeno', type:'bar', stack:'amt', itemStyle:{ borderRadius:[6,6,0,0] }, data: items.map((d:any)=> d.unpaid||0), color:'#ef4444' } ]
  }) as echarts.EChartsOption;
  const paidDonutOpt = (paid:number, unpaid:number) => ({
    backgroundColor: bgColor, tooltip:{ trigger:'item' }, legend:{ top:8,right:8,textStyle:{ color:textColor } },
    series:[{ type:'pie', radius:['60%','80%'], label:{ show:false }, labelLine:{ show:false }, data:[ { name:'Plaćeni', value:paid, itemStyle:{ color:'#22c55e' } }, { name:'Neplaćeni', value:unpaid, itemStyle:{ color:'#ef4444' } } ] }]
  }) as echarts.EChartsOption;

  return (
    <div style={{ display:'grid', gap:16 }}>
      <Space wrap style={{ marginBottom: 8 }}>
        <Select size="small" value={period} onChange={(v)=>{ if (v==='custom') setPeriod('custom'); else applyPreset(v as any); }}
          options={[
            {value:'year',label:'Aktuelna godina'},
            {value:'30d',label:'Zadnjih 30d'},
            {value:'90d',label:'Zadnjih 90d'},
            {value:'180d',label:'Zadnjih 180d'},
            {value:'1y',label:'Zadnjih 12m'},
            {value:'all',label:'Svi zapisi'},
            {value:'custom',label:'Custom'},
          ]}
        />
        {period==='year' && (
          <DatePicker size="small" picker="year" allowClear={false}
            value={(window as any).dayjs?.(`${yearSel}-01-01`)}
            onChange={(d)=>{ const y = d? Number(d.format('YYYY')): new Date().getFullYear(); setYearSel(y); setTimeout(()=> applyPreset('year'), 0); }}
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
            period==='year' ? <Tag color="default">Godina {yearSel}</Tag> : <Tag color="default">{from} – {to}</Tag>
          ) : (
            <Tag color="default">Svi zapisi</Tag>
          )}
        </span>
        <Select size="small" value={dateField} onChange={(v)=> setDateField(v as any)}
          options={[{value:'etd',label:'Po ETD'},{value:'eta',label:'Po ETA'},{value:'delivery',label:'Po Delivery'},{value:'created_at',label:'Po kreiranju'}]} />
        <Tag color="processing">Datum po: {dateField.toUpperCase()}</Tag>
      </Space>
      {/* Info card uklonjen na zahtjev */}
      <Row gutter={[16,16]}>
        <Col xs={24} sm={12} md={6}><Card><div><div style={{opacity:.7,fontSize:12}}>Kontejneri</div><div style={{fontSize:28,fontWeight:700}}>{kpi?.count ?? containers.length}</div></div></Card></Col>
        <Col xs={24} sm={12} md={6}><Card><div><div style={{opacity:.7,fontSize:12}}>Plaćeni</div><div style={{fontSize:28,fontWeight:700,color:'#22c55e'}}>{kpi?.paid_count ?? paidCount}</div></div></Card></Col>
        <Col xs={24} sm={12} md={6}><Card><div><div style={{opacity:.7,fontSize:12}}>Neplaćeni</div><div style={{fontSize:28,fontWeight:700,color:'#ef4444'}}>{kpi?.unpaid_count ?? unpaidCount}</div></div></Card></Col>
        <Col xs={24} sm={12} md={6}><Card><div><div style={{opacity:.7,fontSize:12}}>Ukupan iznos</div><div style={{fontSize:24,fontWeight:700}}>{fmtUSD(kpi?.total_sum ?? totalAmt)}</div></div></Card></Col>
      </Row>
      <Row gutter={[16,16]}>
        <Col xs={24} sm={12} md={6}><Card><div><div style={{opacity:.7,fontSize:12}}>Plaćeno (iznos)</div><div style={{fontSize:24,fontWeight:700,color:'#22c55e'}}>{fmtUSD(kpi ? (kpi.paid_total_sum ?? (kpi.total_sum - (kpi.balance_sum||0))) : paidAmtLocal)}</div></div></Card></Col>
        <Col xs={24} sm={12} md={6}><Card><div><div style={{opacity:.7,fontSize:12}}>Neplaćeno (iznos)</div><div style={{fontSize:24,fontWeight:700,color:'#ef4444'}}>{fmtUSD(kpi ? (kpi.unpaid_total_sum ?? (kpi.balance_sum||0)) : unpaidAmtLocal)}</div></div></Card></Col>
        <Col xs={24} sm={12} md={6}><Card><div><div style={{opacity:.7,fontSize:12}}>Depoziti</div><div style={{fontSize:24,fontWeight:700,color:'#f59e0b'}}>{fmtUSD(kpi?.deposit_sum ?? 0)}</div></div></Card></Col>
      </Row>

      <Row gutter={[16,16]}>
        <Col xs={24} md={14}>
          <Card title={
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
              <span>Iznosi po mjesecima (plaćeno/neplaćeno)</span>
              <Space>
                <Segmented size="small" value={amountView} onChange={(v)=>setAmountView(v as any)} options={[{label:'Area', value:'area'},{label:'Bar', value:'bar'}]} />
                <Switch size="small" checkedChildren={<BulbOutlined />} unCheckedChildren={<BulbOutlined />} checked={dark} onChange={setDark} />
              </Space>
            </div>
          } extra={<Button size="small" icon={<CloudDownloadOutlined />} onClick={()=>{
            const chart = refTrend.current?.getEchartsInstance?.();
            if (chart) { const url = chart.getDataURL({ pixelRatio:2, backgroundColor:'#fff' }); const a=document.createElement('a'); a.href=url; a.download='containers_trend.png'; a.click(); }
          }}>Export image</Button>}>
            <div style={{ width:'100%', height: 320 }}>
              <ReactECharts ref={refTrend} option={amountView==='area'? trendAreaOpt(monthSeries): trendBarOpt(monthSeries)} style={{ width:'100%', height: 320 }} notMerge lazyUpdate theme={dark? 'dark': undefined} echarts={echarts} />
            </div>
          </Card>
        </Col>
        <Col xs={24} md={10}>
          <Card title="Plaćeni vs Neplaćeni (broj)" extra={<Button size="small" icon={<CloudDownloadOutlined />} onClick={()=>{
            const chart = refDonut.current?.getEchartsInstance?.();
            if (chart) { const url = chart.getDataURL({ pixelRatio:2, backgroundColor:'#fff' }); const a=document.createElement('a'); a.href=url; a.download='containers_paid_unpaid.png'; a.click(); }
          }}>Export image</Button>}>
            <div style={{ width:'100%', height: 280 }}>
              <ReactECharts ref={refDonut} option={paidDonutOpt(kpi?.paid_count ?? paidCount, kpi?.unpaid_count ?? unpaidCount)} style={{ width:'100%', height: 280 }} notMerge lazyUpdate theme={dark? 'dark': undefined} echarts={echarts} />
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16,16]}>
        <Col xs={24}>
          <Card title="Kontejneri po dobavljaču (Top 10)" extra={<Space>
            <Button size="small" onClick={()=>{
              const rows = (supplierTop||[]);
              const headers = ['supplier','count','total'];
              const csv = [headers.join(',')].concat(rows.map((r:any)=> headers.map(h=> (r[h]??'')).join(','))).join('\n');
              const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
              const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'top_dobavljaci_kontejneri.csv'; a.click();
            }}>CSV</Button>
            <Button size="small" icon={<CloudDownloadOutlined />} onClick={()=>{
              const el = document.getElementById('ech-top-sup') as any; const chart = el && (el as any).__echartsInstance__; if (chart) {
                const url = chart.getDataURL({ pixelRatio: 2, backgroundColor: '#fff' }); const a = document.createElement('a'); a.href=url; a.download='top_suppliers.png'; a.click();
              }
            }}>Export image</Button>
          </Space>}>
            <div style={{ width:'100%', height: 300 }}>
              <ReactECharts
                ref={refTop}
                option={{
                  backgroundColor: bgColor,
                  tooltip: {
                    trigger:'axis', axisPointer:{ type:'shadow' },
                    formatter: (params:any)=>{
                      const lines = params.map((p:any)=> {
                        const name = p.seriesName;
                        const val = name==='Ukupno' ? fmtUSD(p.value) : new Intl.NumberFormat('de-DE').format(Number(p.value||0));
                        return `${name}: ${val}`;
                      });
                      return `${params[0]?.axisValueLabel || ''}<br/>` + lines.join('<br/>' );
                    }
                  },
                  legend: { top:8, right:8, textStyle:{ color:textColor } },
                  grid: { left:60, right:24, top:32, bottom:24 },
                  xAxis: { type:'category', data: supplierTop.map((r:any)=> r.supplier), axisLabel:{ color:textColor, rotate:-20 }, axisLine:{ lineStyle:{ color:gridColor } } },
                  yAxis: [
                    { type:'value', axisLabel:{ color:textColor }, splitLine:{ lineStyle:{ color:gridColor, opacity:.4 } } },
                    { type:'value', axisLabel:{ color:textColor, formatter:(v:any)=> fmtUSD(v as number) }, position:'right' }
                  ],
                  series: [
                    { name:'Broj', type:'bar', data: supplierTop.map((r:any)=> r.count||0), itemStyle:{ color:'#3f5ae0', borderRadius:[6,6,0,0] } },
                    { name:'Ukupno', type:'bar', yAxisIndex:1, data: supplierTop.map((r:any)=> r.total||0), itemStyle:{ color:'#22c55e', borderRadius:[6,6,0,0] } }
                  ]
                }}
                style={{ width:'100%', height: 300 }} notMerge lazyUpdate theme={dark? 'dark': undefined} echarts={echarts}
              />
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
