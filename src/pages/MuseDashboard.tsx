import React, { useEffect, useMemo, useState } from 'react';
import { Row, Col, Card, Statistic, Space, Button, Modal, Skeleton, Tag, Switch } from 'antd';
import { ArrowUpOutlined, PlusOutlined, CloudDownloadOutlined, BulbOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import { API_BASE, getToken } from '../api/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { realtime } from '../lib/realtime';
import { useUIStore } from '../store';

type KPI = { total: number; by_status: { not_shipped: number; shipped: number; arrived: number } };

export default function MuseDashboard() {
  const [showReport, setShowReport] = useState(false);
  const [loading, setLoading] = useState(true);
  const [kpi, setKpi] = useState<KPI | null>(null);
  const [trend, setTrend] = useState<Array<{ period: string; total: number }>>([]);
  const [costSeries, setCostSeries] = useState<Array<{ period: string; goods: number; freight: number; customs: number; avg_freight: number }>>([]);
  const [delays, setDelays] = useState<Array<{ supplier: string; avg_delay_h: number }>>([]);
  const [recent, setRecent] = useState<Array<{ id:number; text:string; created_at?:string }>>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<any>({ supplier: '', status: 'not_shipped', eta: '' });
  const dark = useUIStore(s => s.darkMode);
  const setDark = useUIStore(s => s.setDarkMode);

  const qc = useQueryClient();
  const qKpi = useQuery({ queryKey: ['dashboard','kpi'], queryFn: async ()=> await fetch(`${API_BASE}/api/kpi`).then(r=>r.json()), staleTime: 120_000 });
  const qTrend = useQuery({ queryKey: ['dashboard','trend'], queryFn: async ()=> { const t=await fetch(`${API_BASE}/api/analytics/arrivals/trend-costs?granularity=month`).then(r=>r.json()); return Array.isArray(t?.items)? t.items: []; }, staleTime: 120_000 });
  const qList = useQuery({ queryKey: ['dashboard','arrivals-list'], queryFn: async ()=> await fetch(`${API_BASE}/api/analytics/arrivals/list`).then(r=>r.json()), staleTime: 120_000 });
  const qTop = useQuery({ queryKey: ['dashboard','top-delays'], queryFn: async ()=> { const ts=await fetch(`${API_BASE}/api/analytics/arrivals/top-suppliers?limit=5`).then(r=>r.json()); return Array.isArray(ts?.items)? ts.items: []; }, staleTime: 120_000 });
  const qRecent = useQuery({ queryKey: ['dashboard','recent'], queryFn: async ()=> await fetch(`${API_BASE}/api/notifications?limit=8`, { headers: getToken()? { Authorization: `Bearer ${getToken()}` } : undefined }).then(r=>r.json()), staleTime: 60_000 });

  useEffect(()=>{
    setLoading(qKpi.isFetching || qTrend.isFetching || qList.isFetching || qTop.isFetching || qRecent.isFetching);
    setKpi((qKpi.data as any) || null);
    setTrend((qTrend.data as any) || []);
    setRecent(Array.isArray(qRecent.data)? qRecent.data : []);
    // derive cost series from list
    try {
      const list = (qList.data as any)?.items || [];
      const buckets: Record<string, { goods:number; freight:number; customs:number; n:number }> = {};
      list.forEach((a:any)=>{
        const key = (a.arrived_at || a.eta || '').slice(0,7) || 'unknown';
        const b = (buckets[key] ||= { goods:0, freight:0, customs:0, n:0 });
        b.goods += Number(a.goods_cost||0);
        b.freight += Number(a.freight_cost||0);
        b.customs += Number(a.customs_cost||0);
        b.n += 1;
      });
      const series = Object.keys(buckets).sort().map(k=> ({ period:k, goods:buckets[k].goods, freight:buckets[k].freight, customs:buckets[k].customs, avg_freight: buckets[k].n? buckets[k].freight/buckets[k].n: 0 }));
      setCostSeries(series);
    } catch {}
    // top delays map
    try {
      const ts = (qTop.data as any) || [];
      const d = ts.map((r:any)=> ({ supplier: r.supplier, avg_delay_h: Number(r.avg_delay_h||0) })).sort((a:any,b:any)=> b.avg_delay_h - a.avg_delay_h).slice(0,5);
      setDelays(d);
    } catch {}
  }, [qKpi.data, qTrend.data, qList.data, qTop.data, qRecent.data, qKpi.isFetching, qTrend.isFetching, qList.isFetching, qTop.isFetching, qRecent.isFetching]);

  useEffect(()=>{
    const off = realtime.on((evt) => {
      if (evt.resource === 'arrivals' || evt.type?.startsWith('arrivals.')) {
        qc.invalidateQueries({ queryKey: ['dashboard'] });
      }
      if (evt.type === 'notifications.created') {
        qc.invalidateQueries({ queryKey: ['dashboard','recent'] });
      }
    });
    return () => { try { off?.(); } catch {} };
  }, [qc]);

  // ECharts helpers
  const textColor = dark ? '#e5e7eb' : '#334155';
  const gridColor = dark ? '#334155' : '#e5e7eb';
  const bgColor = 'transparent';
  const stackedCostsOption = (items: typeof costSeries) => ({
    backgroundColor: bgColor,
    tooltip: { trigger: 'axis' },
    legend: { top: 8, right: 8, textStyle:{ color:textColor } },
    grid: { left: 40, right: 16, top: 32, bottom: 28 },
    xAxis: { type:'category', data: items.map(d=>d.period), axisLabel:{ color:textColor }, axisLine:{ lineStyle:{ color: gridColor } } },
    yAxis: { type:'value', axisLabel:{ color:textColor }, splitLine:{ lineStyle:{ color: gridColor, opacity:.4 } } },
    series: [
      { name:'Roba', type:'bar', stack:'cost', emphasis:{ focus:'series' }, itemStyle:{ borderRadius:[6,6,0,0] }, data: items.map(d=>d.goods), color:'#3b82f6' },
      { name:'Prevoz', type:'bar', stack:'cost', itemStyle:{ borderRadius:[6,6,0,0] }, data: items.map(d=>d.freight), color:'#22c55e' },
      { name:'Carina', type:'bar', stack:'cost', itemStyle:{ borderRadius:[6,6,0,0] }, data: items.map(d=>d.customs), color:'#f59e0b' },
      { name:'Avg Prevoz', type:'line', smooth:true, data: items.map(d=>d.avg_freight), color:'#111827' },
    ]
  }) as echarts.EChartsOption;
  const delaysOption = (items: typeof delays) => ({
    backgroundColor: bgColor,
    tooltip: { trigger: 'axis', axisPointer:{ type:'shadow' } },
    grid: { left: 120, right: 16, top: 16, bottom: 24 },
    xAxis: { type:'value', axisLabel:{ color:textColor }, splitLine:{ lineStyle:{ color: gridColor, opacity:.4 } } },
    yAxis: { type:'category', data: items.map(d=>d.supplier), axisLabel:{ color:textColor } },
    series: [{ type:'bar', data: items.map(d=>Number((d.avg_delay_h/24).toFixed(1))), itemStyle:{ color:'#ef4444', borderRadius:[6,6,6,6] }, label:{ show:true, position:'right', formatter:'{c} d' } }]
  }) as echarts.EChartsOption;

  const donut = useMemo(() => ([
    { name: 'Najavljeno', value: kpi?.by_status?.not_shipped ?? 0, color: '#6366f1' },
    { name: 'U transportu', value: kpi?.by_status?.shipped ?? 0, color: '#ef4444' },
    { name: 'Stiglo', value: kpi?.by_status?.arrived ?? 0, color: '#22c55e' },
  ]), [kpi]);

  async function createArrival(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/api/arrivals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(getToken()? { Authorization: `Bearer ${getToken()}` } : {}) },
        body: JSON.stringify(form)
      });
      if (!res.ok) throw new Error(await res.text());
      setCreateOpen(false); setForm({ supplier:'', status:'not_shipped', eta:'' });
    } catch (err) { console.warn('Create failed', err); }
  }

  const reportHtml = `
    <h3>Redizajn Dashboarda</h3>
    <p>Kartice sa mekanim sjenama, zaobljeni uglovi, moderan vizual. Fokus na brze CRUD tokove, KPI-jeve i vizualizacije. Ovo je sažetak – puni dokument je dostupan pod \"Puni dokument\".</p>
  `;

  // ECharts options for Trend and Donut
  const lineOption = (items: Array<{ period:string; total:number }>) => ({
    backgroundColor: 'transparent',
    textStyle: { color: dark ? '#e5e7eb' : '#334155' },
    tooltip: { trigger: 'axis', axisPointer: { type: 'line' } },
    grid: { left: 40, right: 16, top: 24, bottom: 28 },
    xAxis: { type: 'category', data: items.map(d=>d.period), axisLine:{ lineStyle:{ color: dark?'#334155':'#e5e7eb' } }, axisLabel:{ color: dark?'#e5e7eb':'#334155' } },
    yAxis: { type: 'value', axisLine:{ show:false }, splitLine:{ lineStyle:{ color: dark?'#334155':'#e5e7eb', opacity:.4 } }, axisLabel:{ color: dark?'#e5e7eb':'#334155' } },
    series: [
      { type:'line', smooth:true, name:'Ukupno', data: items.map(d=>d.total), lineStyle:{ width:2, color:'#3f5ae0' }, areaStyle:{ color: new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:'rgba(63,90,224,0.35)'},{offset:1,color:'rgba(63,90,224,0.05)'}]) }, showSymbol:false },
    ]
  }) as echarts.EChartsOption;
  const donutOption = (data: Array<{ name:string; value:number; color:string }>) => ({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item' },
    legend: { top: 8, right: 8, textStyle:{ color: dark?'#e5e7eb':'#334155' } },
    series: [{
      type:'pie', radius:['60%','80%'], avoidLabelOverlap:true,
      label:{ show:false }, labelLine:{ show:false },
      itemStyle:{ borderRadius:8, borderColor: 'transparent', borderWidth: 2 },
      data: data.map(d=> ({ name:d.name, value:d.value, itemStyle:{ color:d.color }}))
    }]
  }) as echarts.EChartsOption;

  const trendRef = React.useRef<any>(null);
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12} lg={6}>
          <Card style={{ borderRadius: 16, boxShadow: '0 6px 24px rgba(0,0,0,0.06)' }}>
            {loading ? <Skeleton active paragraph={false} /> : (
              <Statistic title="Ukupno dolazaka" value={kpi?.total ?? 0} precision={0} valueStyle={{ color: '#111827' }} />
            )}
          </Card>
        </Col>
        <Col xs={24} md={12} lg={6}>
          <Card style={{ borderRadius: 16, boxShadow: '0 6px 24px rgba(0,0,0,0.06)' }}>
            {loading ? <Skeleton active paragraph={false} /> : (
              <Statistic title="Najavljeno" value={kpi?.by_status?.not_shipped ?? 0} precision={0} valueStyle={{ color: '#6366f1' }} prefix={<ArrowUpOutlined />} />
            )}
          </Card>
        </Col>
        <Col xs={24} md={12} lg={6}>
          <Card style={{ borderRadius: 16, boxShadow: '0 6px 24px rgba(0,0,0,0.06)' }}>
            {loading ? <Skeleton active paragraph={false} /> : (
              <Statistic title="U transportu" value={kpi?.by_status?.shipped ?? 0} precision={0} valueStyle={{ color: '#ef4444' }} />
            )}
          </Card>
        </Col>
        <Col xs={24} md={12} lg={6}>
          <Card style={{ borderRadius: 16, boxShadow: '0 6px 24px rgba(0,0,0,0.06)' }}>
            {loading ? <Skeleton active paragraph={false} /> : (
              <Statistic title="Stiglo" value={kpi?.by_status?.arrived ?? 0} precision={0} valueStyle={{ color: '#22c55e' }} />
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16,16]}>
        <Col xs={24} lg={14}>
          <Card title={<Space>
            <span>Trend troškova (mjesečno)</span>
            <Switch size="small" checkedChildren={<BulbOutlined />} unCheckedChildren={<BulbOutlined />} checked={dark} onChange={setDark} />
          </Space>} style={{ borderRadius: 16, boxShadow: '0 6px 24px rgba(0,0,0,0.06)' }} extra={<Button size="small" icon={<CloudDownloadOutlined />} onClick={()=>{
            try {
              const chart = trendRef.current?.getEchartsInstance?.();
              if (chart) {
                const url = chart.getDataURL({ pixelRatio: 2, backgroundColor: '#fff' });
                const a=document.createElement('a'); a.href=url; a.download='trend.png'; a.click();
              }
            } catch {}
          }}>Export image</Button>}>
            <div style={{ width:'100%', height: 280 }}>
              {loading ? <Skeleton active /> : (
                <ReactECharts ref={trendRef} option={lineOption(trend)} style={{ width:'100%', height: 280 }} notMerge lazyUpdate theme={dark? 'dark': undefined} echarts={echarts} />
              )}
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="Distribucija po statusu" style={{ borderRadius: 16, boxShadow: '0 6px 24px rgba(0,0,0,0.06)' }}>
            <div style={{ width:'100%', height: 280 }}>
              {loading ? <Skeleton active /> : (
                <ReactECharts option={donutOption(donut)} style={{ width:'100%', height: 280 }} notMerge lazyUpdate theme={dark? 'dark': undefined} echarts={echarts} />
              )}
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16,16]}>
        <Col xs={24} lg={14}>
          <Card title="Brzi unos dolaska" style={{ borderRadius: 16, boxShadow: '0 6px 24px rgba(0,0,0,0.06)' }} extra={<Button type="primary" icon={<PlusOutlined />} onClick={()=> setCreateOpen(true)}>Novi</Button>}>
            <div style={{ color:'#64748b' }}>Kreiraj novi zapis bez napuštanja Dashboard‑a.</div>
            <Modal title="Novi dolazak" open={createOpen} onCancel={()=> setCreateOpen(false)} onOk={(e)=>{ const ev = e as any; ev?.preventDefault?.(); const formEl=document.getElementById('quick-create'); (formEl as HTMLFormElement)?.requestSubmit?.(); }}>
              <form id="quick-create" onSubmit={createArrival} style={{ display:'grid', gap:8 }}>
                <input placeholder="Dobavljač" value={form.supplier} onChange={(e)=> setForm((p:any)=> ({...p, supplier:e.target.value}))} style={{ padding:8, border:'1px solid #e5e7eb', borderRadius:8 }} />
                <select value={form.status} onChange={(e)=> setForm((p:any)=> ({...p, status: e.target.value}))} style={{ padding:8, border:'1px solid #e5e7eb', borderRadius:8 }}>
                  <option value="not_shipped">Najavljeno</option>
                  <option value="shipped">U transportu</option>
                  <option value="arrived">Stiglo</option>
                </select>
                <input type="date" placeholder="ETA" onChange={(e)=> setForm((p:any)=> ({...p, eta: e.target.value}))} style={{ padding:8, border:'1px solid #e5e7eb', borderRadius:8 }} />
                <button type="submit" style={{ padding:'8px 12px', background:'#3f5ae0', color:'#fff', border:'none', borderRadius:8 }}>Sačuvaj</button>
              </form>
            </Modal>
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="Aktivnosti" style={{ borderRadius: 16, boxShadow: '0 6px 24px rgba(0,0,0,0.06)' }}>
            {loading ? <Skeleton active /> : (
              <Space direction="vertical" style={{ width:'100%' }}>
                {recent.length === 0 && <div style={{ color:'#94a3b8' }}>Nema novijih aktivnosti.</div>}
                {recent.map(n => (
                  <div key={n.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid #f1f5f9' }}>
                    <div>{n.text}</div>
                    <Tag color="default">{n.created_at ? new Date(n.created_at).toLocaleString() : ''}</Tag>
                  </div>
                ))}
              </Space>
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16,16]}>
        <Col xs={24} lg={14}>
          <Card title={<Space>
            <span>Troškovi kroz vrijeme (stack + avg)</span>
            <Switch size="small" checkedChildren={<BulbOutlined />} unCheckedChildren={<BulbOutlined />} checked={dark} onChange={setDark} />
          </Space>} style={{ borderRadius: 16, boxShadow: '0 6px 24px rgba(0,0,0,0.06)' }}>
            <div style={{ width:'100%', height: 300 }}>
              {loading ? <Skeleton active /> : (
                <ReactECharts option={stackedCostsOption(costSeries)} style={{ width:'100%', height: 300 }} notMerge lazyUpdate theme={dark? 'dark': undefined} echarts={echarts} />
              )}
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title={<Space>
            <span>Top 5 kašnjenja po dobavljaču (dani)</span>
            <Switch size="small" checked={dark} onChange={setDark} />
          </Space>} style={{ borderRadius: 16, boxShadow: '0 6px 24px rgba(0,0,0,0.06)' }}>
            <div style={{ width:'100%', height: 300 }}>
              {loading ? <Skeleton active /> : (
                <ReactECharts option={delaysOption(delays)} style={{ width:'100%', height: 300 }} notMerge lazyUpdate theme={dark? 'dark': undefined} echarts={echarts} />
              )}
            </div>
          </Card>
        </Col>
      </Row>

      <Modal open={showReport} onCancel={()=> setShowReport(false)} footer={null} title="Strateški tehnološki sklop i ključne odluke" width={960} styles={{ body: { maxHeight: 600, overflow: 'auto' } }}>
        <div style={{ lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: reportHtml }} />
      </Modal>
    </Space>
  );
}
