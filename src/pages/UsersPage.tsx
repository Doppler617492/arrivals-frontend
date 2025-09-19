import React from 'react';
import { apiGET, apiPOST, apiPATCH, apiUPLOAD } from '../api/client';
import { Table, Tag, Drawer, Tabs, Button, Input, Select, Space, Dropdown, Segmented, DatePicker, Badge } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DownOutlined } from '@ant-design/icons';

type Role = 'admin' | 'manager' | 'magacioner' | 'komercijalista' | 'viewer' | 'external';
type Status = 'active' | 'invited' | 'suspended' | 'locked';

type User = {
  id: number;
  email: string;
  username?: string;
  name: string;
  phone?: string;
  role: Role;
  status: Status;
  type?: 'internal' | 'external';
  created_at: string;
  last_activity_at?: string;
  kpi_7d?: { processed?: number; avg_duration_minutes?: number | null; on_time_pct?: number | null };
  tasks_today?: number;
};

const roleColors: Record<Role, string> = {
  admin: 'magenta', manager: 'geekblue', magacioner: 'green', komercijalista: 'gold', viewer: 'default', external: 'purple'
};

export default function UsersPage() {
  const [rows, setRows] = React.useState<User[]>([]);
  const [selectedKeys, setSelectedKeys] = React.useState<number[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [drawer, setDrawer] = React.useState<{ open: boolean; user?: User }>({ open: false });
  const [q, setQ] = React.useState('');
  const [roleFilter, setRoleFilter] = React.useState<Role[] | undefined>(undefined);
  const [statusFilter, setStatusFilter] = React.useState<Status | undefined>(undefined);
  const [range, setRange] = React.useState<'24h' | '7d' | '30d'>('7d');
  const [density, setDensity] = React.useState<'middle' | 'small'>('middle');
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);
  const [total, setTotal] = React.useState<number | undefined>(undefined);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [colVis, setColVis] = React.useState<Record<string, boolean>>(()=>{ try { return JSON.parse(localStorage.getItem('users_cols')||'{}'); } catch { return {}; } });
  const [advanced, setAdvanced] = React.useState<{ locations:string; createdFrom?: string; createdTo?: string; lastLoginFrom?: string; lastLoginTo?: string; failedLoginsGte?: number }>({ locations:'', createdFrom: undefined, createdTo: undefined, lastLoginFrom: undefined, lastLoginTo: undefined, failedLoginsGte: undefined });

  const fetchList = React.useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (roleFilter && roleFilter.length) qs.set('role', roleFilter.join(','));
      if (statusFilter) qs.set('status', statusFilter);
      if (range) qs.set('since', range);
      if (advanced.locations) qs.set('locations', advanced.locations);
      if (advanced.createdFrom) qs.set('created_from', advanced.createdFrom);
      if (advanced.createdTo) qs.set('created_to', advanced.createdTo);
      if (advanced.lastLoginFrom) qs.set('last_login_from', advanced.lastLoginFrom);
      if (advanced.lastLoginTo) qs.set('last_login_to', advanced.lastLoginTo);
      if (advanced.failedLoginsGte != null) qs.set('failed_logins_gte', String(advanced.failedLoginsGte));
      qs.set('page', String(page));
      qs.set('page_size', String(pageSize));
      const data = await apiGET<any>(`/api/users${qs.toString()?`?${qs.toString()}`:''}`, true);
      if (Array.isArray(data)) { setRows(data); setTotal(undefined); }
      else { setRows(data?.items || []); setTotal(data?.total); }
    } finally { setLoading(false); }
  }, [roleFilter, statusFilter, range, page, pageSize, advanced]);

  // Load saved view (URL -> localStorage fallback)
  React.useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const q0 = sp.get('q') || '';
    const r0 = (sp.get('role') || '').split(',').filter(Boolean) as Role[];
    const s0 = (sp.get('status') || undefined) as Status | undefined;
    const rng0 = (sp.get('since') as any) || '7d';
    const den0 = (sp.get('density') as any) || undefined;
    if (q0) setQ(q0);
    if (r0.length) setRoleFilter(r0);
    if (s0) setStatusFilter(s0);
    if (rng0) setRange(rng0);
    if (den0 === 'small' || den0 === 'middle') setDensity(den0);
    if (!sp.toString()) {
      try {
        const saved = JSON.parse(localStorage.getItem('users_view') || 'null');
        if (saved) {
          setQ(saved.q ?? '');
          setRoleFilter(saved.roleFilter ?? undefined);
          setStatusFilter(saved.statusFilter ?? undefined);
          setRange(saved.range ?? '7d');
          setDensity(saved.density ?? 'middle');
        }
      } catch {}
    }
  }, []);

  // Persist view state (URL + localStorage)
  React.useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (q) sp.set('q', q); else sp.delete('q');
    if (roleFilter && roleFilter.length) sp.set('role', roleFilter.join(',')); else sp.delete('role');
    if (statusFilter) sp.set('status', statusFilter); else sp.delete('status');
    if (range) sp.set('since', range); else sp.delete('since');
    if (density) sp.set('density', density);
    const str = sp.toString();
    const next = `${window.location.pathname}${str?`?${str}`:''}`;
    window.history.replaceState(null, '', next);
    try { localStorage.setItem('users_view', JSON.stringify({ q, roleFilter, statusFilter, range, density })); } catch {}
  }, [q, roleFilter, statusFilter, range, density]);

  React.useEffect(() => { fetchList(); }, [fetchList]);

  const filtered = React.useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(r => [r.name, r.email, r.username, r.role, r.status].filter(Boolean).join(' ').toLowerCase().includes(term));
  }, [rows, q]);

  const columns: ColumnsType<User> = [
    {
      title: 'Korisnik', dataIndex: 'name', key: 'name', hidden: colVis.name === false,
      render: (_, r) => (
        <Space>
          <div style={{ width: 28, height: 28, borderRadius: 999, background: '#334155', color:'#fff', display:'grid', placeItems:'center', fontWeight:700 }}>
            {(r.name || r.email).slice(0,1).toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 600 }}>{r.name || '(bez imena)'}</div>
            <div style={{ fontSize: 12, color:'#6B7280' }}>{r.email}{r.username?` • ${r.username}`:''}</div>
          </div>
        </Space>
      )
    },
    { title: 'Email', dataIndex: 'email', key: 'email', width: 220, hidden: colVis.email === false, ellipsis: true, render: (v:string)=> <span style={{ color:'#374151' }}>{v}</span> },
    { title: 'Uloga', dataIndex: 'role', key: 'role', width: 140, hidden: colVis.role === false,
      render: (v: Role) => <Tag style={{ borderRadius:999, padding:'0 8px', fontWeight:600 }} color={v==='admin'?'geekblue':v==='manager'?'green':v==='viewer'?'default':'blue'}>{v}</Tag>
    },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 140, hidden: colVis.status === false,
      render: (s: Status) => {
        const color = s==='active'?'#16A34A': s==='suspended'?'#6B7280': s==='locked'?'#F59E0B': '#3B82F6';
        const bg = s==='active'?'#DCFCE7': s==='suspended'?'#F3F4F6': s==='locked'?'#FEF3C7': '#DBEAFE';
        return <span style={{ background:bg, color, borderRadius:999, padding:'2px 10px', fontSize:12, fontWeight:600 }}>{s}</span>;
      }
    },
    { title: 'Pi', dataIndex: 'kpi_7d', key: 'kpi', width: 80, align: 'center', hidden: colVis.kpi === false, render: (k:any)=> <span style={{ fontSize:12, fontWeight:600 }}>{k?.processed ?? 0}</span> },
    { title: 'Last Activity', dataIndex: 'last_activity_at', key: 'last', width: 220, hidden: colVis.last_activity_at === false,
      render: (v?: string) => {
        if (!v) return null;
        const days = Math.max(0, Math.floor((Date.now() - new Date(v).getTime()) / (1000*60*60*24)));
        const good = days <= 7; const warn = days > 7 && days <= 30; const bad = days > 30;
        const color = good? '#16A34A' : warn? '#F59E0B' : '#EF4444';
        const pct = Math.min(100, Math.round((30 - Math.min(days,30)) / 30 * 100));
        return (
          <div title={new Date(v).toISOString()} style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ flex:1, height:10, background:'#E5E7EB', borderRadius:999, overflow:'hidden' }}>
              <div style={{ width: `${pct}%`, height:'100%', background: color }} />
            </div>
            <span style={{ fontSize:12, color:'#6B7280' }}>{days}d</span>
          </div>
        );
      }
    },
    { title: 'Zadaci danas', dataIndex: 'tasks_today', key: 'tasks_today', width: 120, align: 'right', hidden: colVis.tasks_today === false },
    { title: 'KPI 7d', dataIndex: 'kpi_7d', key: 'kpi_7d', width: 180, hidden: colVis.kpi2 === false,
      render: (k: any) => (
        <div style={{ fontSize:12 }}>
          <div>Obrađeno: <b>{k?.processed ?? 0}</b></div>
        </div>
      )
    },
    { title: '', key: 'actions', fixed: 'right', width: 60,
      render: (_, r) => {
        const items = [
          { key: 'view', icon: <EyeOutlined />, label: 'View' },
          { key: 'edit', icon: <EditOutlined />, label: 'Edit' },
          { key: 'reset', icon: <RedoOutlined />, label: 'Reset Password' },
          { key: 'toggle', icon: r.status==='active'? <StopOutlined /> : <UnlockOutlined />, label: r.status==='active'? 'Deactivate' : 'Activate' },
          { key: 'lock', icon: <LockOutlined />, label: 'Lock Account' },
          { key: 'revoke', icon: <DeleteOutlined />, label: 'Revoke sessions' },
          { type: 'divider' as any },
          { key: 'delete', icon: <DeleteOutlined />, danger: true as any, label: 'Delete' },
        ];
        return (
          <Dropdown
            menu={{ items, onClick: async ({ key }) => {
              if (key==='view' || key==='edit') setDrawer({ open:true, user:r });
              if (key==='reset') {
                const resp = await apiPOST<any>(`/api/users/${r.id}/password/reset`, { generate_temp: true }, { auth: true });
                alert(`Privremena lozinka: ${resp?.temp_password || '(nije generisana)'}`);
              }
              if (key==='toggle') {
                const status: Status = r.status==='active' ? 'suspended' : 'active';
                await apiPOST(`/api/users/bulk/status`, { ids: [r.id], status }, { auth: true });
                fetchList();
              }
              if (key==='lock') { await apiPOST(`/api/users/${r.id}/lock`, {}, { auth: true }); fetchList(); }
              if (key==='revoke') {
                await fetch(`${import.meta.env.VITE_API_BASE?.replace(/\/$/,'') || 'http://localhost:8081'}/api/users/${r.id}/sessions`, { method:'DELETE', headers:{ Authorization:`Bearer ${localStorage.getItem('token')}` } });
              }
              if (key==='delete') {
                if (!confirm('Soft delete this user?')) return;
                await apiDELETE(`/api/users/${r.id}`, true);
                fetchList();
              }
            } }}
            trigger={["click"]}
          >
            <Button type="text" size="small" icon={<MoreOutlined />} />
          </Dropdown>
        );
      }
    }
  ];

  const selected = rows.filter(r => selectedKeys.includes(r.id));
  const kpiActive7d = React.useMemo(() => rows.filter(r => r.last_activity_at && (range!=='24h')).length, [rows, range]);
  const avgProcessed7d = React.useMemo(() => {
    const xs = rows.map(r => r.kpi_7d?.processed || 0);
    if (!xs.length) return 0;
    return Math.round(xs.reduce((a,b)=>a+b,0) / xs.length);
  }, [rows]);
  const onTimePct = 0; // placeholder
  const tasksToday = React.useMemo(() => rows.reduce((a,b)=> a + (b.tasks_today || 0), 0), [rows]);

  const activeFilterCount = (roleFilter?.length||0) + (statusFilter?1:0) + (advanced.locations?1:0) + (advanced.createdFrom?1:0) + (advanced.createdTo?1:0) + (advanced.lastLoginFrom?1:0) + (advanced.lastLoginTo?1:0) + (advanced.failedLoginsGte?1:0);

  return (
    <div className="grid gap-12">
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-lg bg-white/5 p-4">
          <div className="text-xs opacity-70">Aktivni korisnici (7d)</div>
          <div className="text-2xl font-semibold">{kpiActive7d}</div>
        </div>
        <div className="rounded-lg bg-white/5 p-4">
          <div className="text-xs opacity-70">Pros. # obrađenih (7d)</div>
          <div className="text-2xl font-semibold">{avgProcessed7d}</div>
        </div>
        <div className="rounded-lg bg-white/5 p-4">
          <div className="text-xs opacity-70">% on-time (7d)</div>
          <div className="text-2xl font-semibold">{onTimePct}%</div>
        </div>
        <div className="rounded-lg bg-white/5 p-4">
          <div className="text-xs opacity-70">Otvoreni zadaci danas</div>
          <div className="text-2xl font-semibold">{tasksToday}</div>
        </div>
      </div>

      <div className="flex items-end justify-between gap-3">
        <Space wrap>
          <Input placeholder="Pretraga (/ fokus)" value={q} onChange={(e)=> setQ(e.target.value)} />
          <Select allowClear mode="multiple" style={{ minWidth: 220 }} placeholder="Uloga" value={roleFilter} onChange={setRoleFilter as any}
                  options={["admin","manager","magacioner","komercijalista","viewer","external"].map(r=>({ value:r, label:r }))} />
          <Select allowClear style={{ width: 160 }} placeholder="Status" value={statusFilter as any} onChange={setStatusFilter as any}
                  options={["active","invited","suspended","locked"].map(s=>({ value:s, label:s }))} />
          <Select style={{ width: 140 }} value={range} onChange={setRange as any} options={[{value:'24h',label:'24h'},{value:'7d',label:'7 dana'},{value:'30d',label:'30 dana'}]} />
          <Button onClick={()=> setFiltersOpen(true)}>Filteri {activeFilterCount? <Badge count={activeFilterCount} />: null}</Button>
        </Space>
        <Space>
          <Button type="primary" onClick={()=> setCreateOpen(true)}>+ Novi korisnik</Button>
          <Dropdown
            menu={{
              items: [
                { key: 'roles', label: 'Dodijeli uloge' },
                { key: 'status', label: 'Suspend/Reactivate' },
                { key: 'reset', label: 'Reset lozinke' },
                { key: 'export', label: 'Export CSV' },
              ],
              onClick: async ({ key }) => {
                if (!selectedKeys.length) { alert('Nema selekcije'); return; }
                if (key==='export') {
                  const qs = new URLSearchParams();
                  if (roleFilter && roleFilter.length) qs.set('role', roleFilter[0]);
                  if (statusFilter) qs.set('status', statusFilter);
                  const url = `${import.meta.env.VITE_API_BASE?.replace(/\/$/,'') || 'http://localhost:8081'}/api/users/export${qs.toString()?`?${qs}`:''}`;
                  window.open(url, '_blank');
                  return;
                }
                if (key==='status') {
                  const status: Status = 'suspended';
                  await apiPOST(`/api/users/bulk/status`, { ids: selectedKeys, status }, { auth: true });
                  fetchList();
                }
                if (key==='reset') {
                  const resp = await apiPOST<any>(`/api/users/bulk/reset_password`, { ids: selectedKeys }, { auth: true });
                  alert(`Privremene lozinke:\n${Object.entries(resp?.temp_passwords||{}).map(([k,v])=>`${k}: ${v}`).join('\n')}`);
                }
                if (key==='roles') {
                  const roles = prompt('Role keys (comma-separated), npr: manager,viewer');
                  if (!roles) return;
                  await apiPOST(`/api/users/bulk/roles`, { ids: selectedKeys, roles: roles.split(',').map(s=>s.trim()).filter(Boolean) }, { auth: true });
                  fetchList();
                }
              }
            }}
            trigger={["click"]}
          >
            <Button type="primary">Bulk akcije <DownOutlined /></Button>
          </Dropdown>
          <Segmented
            options={[{label:'Comfortable', value:'middle'}, {label:'Compact', value:'small'}]}
            value={density}
            onChange={(v)=> setDensity(v as any)}
          />
          <Dropdown
            menu={{ items: [
              { key:'name', label: <label><input type="checkbox" checked={colVis.name!==false} onChange={(e)=> { const nv = {...colVis, name: e.target.checked}; setColVis(nv); localStorage.setItem('users_cols', JSON.stringify(nv)); }} /> Ime/Email</label> },
              { key:'role', label: <label><input type="checkbox" checked={colVis.role!==false} onChange={(e)=> { const nv = {...colVis, role: e.target.checked}; setColVis(nv); localStorage.setItem('users_cols', JSON.stringify(nv)); }} /> Uloga</label> },
              { key:'status', label: <label><input type="checkbox" checked={colVis.status!==false} onChange={(e)=> { const nv = {...colVis, status: e.target.checked}; setColVis(nv); localStorage.setItem('users_cols', JSON.stringify(nv)); }} /> Status</label> },
              { key:'tasks', label: <label><input type="checkbox" checked={colVis.tasks_today!==false} onChange={(e)=> { const nv = {...colVis, tasks_today: e.target.checked}; setColVis(nv); localStorage.setItem('users_cols', JSON.stringify(nv)); }} /> Zadaci</label> },
              { key:'kpi', label: <label><input type="checkbox" checked={colVis.kpi!==false} onChange={(e)=> { const nv = {...colVis, kpi: e.target.checked}; setColVis(nv); localStorage.setItem('users_cols', JSON.stringify(nv)); }} /> KPI</label> },
              { key:'last', label: <label><input type="checkbox" checked={colVis.last_activity_at!==false} onChange={(e)=> { const nv = {...colVis, last_activity_at: e.target.checked}; setColVis(nv); localStorage.setItem('users_cols', JSON.stringify(nv)); }} /> Posl. aktivnost</label> },
              { key:'created', label: <label><input type="checkbox" checked={colVis.created_at!==false} onChange={(e)=> { const nv = {...colVis, created_at: e.target.checked}; setColVis(nv); localStorage.setItem('users_cols', JSON.stringify(nv)); }} /> Kreiran</label> },
            ]}}
          >
            <Button>Kolone</Button>
          </Dropdown>
        </Space>
      </div>

      <div className="rounded-lg border border-white/10 bg-white/5">
        <Table
          rowKey="id"
          size={density}
          sticky
          loading={loading}
          dataSource={filtered}
          columns={columns}
          pagination={{ current: page, pageSize, total: total ?? filtered.length, showSizeChanger: true, onChange: (p, ps)=> { setPage(p); setPageSize(ps); } }}
          rowSelection={{ selectedRowKeys: selectedKeys, onChange: (keys)=> setSelectedKeys(keys as number[]) }}
          onRow={(r)=> ({ onClick: ()=> setDrawer({ open: true, user: r }) })}
        />
      </div>

      {/* Filters drawer */}
      <Drawer title="Filteri" placement="right" width={360} onClose={()=> setFiltersOpen(false)} open={filtersOpen} destroyOnClose>
        <div className="grid gap-3">
          <label className="grid gap-1"><span className="text-xs opacity-70">Lokacije (CSV)</span><Input value={advanced.locations} onChange={(e)=> setAdvanced(a=> ({...a, locations: e.target.value}))} /></label>
          <div className="grid gap-1"><span className="text-xs opacity-70">Kreiran</span>
            <Space>
              <DatePicker placeholder="Od" onChange={(d)=> setAdvanced(a=> ({...a, createdFrom: d? d.toISOString(): undefined}))} />
              <DatePicker placeholder="Do" onChange={(d)=> setAdvanced(a=> ({...a, createdTo: d? d.toISOString(): undefined}))} />
            </Space>
          </div>
          <div className="grid gap-1"><span className="text-xs opacity-70">Zadnja prijava</span>
            <Space>
              <DatePicker placeholder="Od" onChange={(d)=> setAdvanced(a=> ({...a, lastLoginFrom: d? d.toISOString(): undefined}))} />
              <DatePicker placeholder="Do" onChange={(d)=> setAdvanced(a=> ({...a, lastLoginTo: d? d.toISOString(): undefined}))} />
            </Space>
          </div>
          <label className="grid gap-1"><span className="text-xs opacity-70">Neuspjele prijave ≥</span><Input type="number" value={advanced.failedLoginsGte as any} onChange={(e)=> setAdvanced(a=> ({...a, failedLoginsGte: Number(e.target.value)}))} /></label>
          <div className="flex gap-2">
            <Button onClick={()=> { setAdvanced({ locations:'', createdFrom: undefined, createdTo: undefined, lastLoginFrom: undefined, lastLoginTo: undefined, failedLoginsGte: undefined }); }}>Reset</Button>
            <Button type="primary" onClick={()=> { setFiltersOpen(false); setPage(1); fetchList(); }}>Primijeni</Button>
          </div>
        </div>
      </Drawer>

      {/* Create drawer */}
      <Drawer title="Novi korisnik" placement="right" width={420} onClose={()=> setCreateOpen(false)} open={createOpen} destroyOnClose>
        <CreateUser onCreated={()=> { setCreateOpen(false); fetchList(); }} />
      </Drawer>

      <Drawer title={drawer.user? drawer.user.name : 'Korisnik'} placement="right" width={520} onClose={()=> setDrawer({ open:false })} open={drawer.open} destroyOnClose>
        {drawer.user && (
          <Tabs
            items={[
              { key:'profile', label:'Profil', children: <ProfileTab user={drawer.user} onSaved={fetchList} /> },
              { key:'rbac', label:'Prava', children: <RBAC user={drawer.user} /> },
              { key:'activity', label:'Aktivnost', children: <Activity user={drawer.user} /> },
              { key:'sessions', label:'Sesije/Uređaji', children: <Sessions user={drawer.user} /> },
              { key:'notifications', label:'Notifikacije', children: <Notifications user={drawer.user} /> },
              { key:'productivity', label:'Produktivnost', children: <Productivity user={drawer.user} /> },
              { key:'notes', label:'Napomene/Prilozi', children: <NotesFiles user={drawer.user} /> },
            ]}
          />
        )}
      </Drawer>
    </div>
  );
}

function ProfileTab({ user, onSaved }: { user: User; onSaved: ()=>void }) {
  const [form, setForm] = React.useState({ name: user.name || '', phone: user.phone || '', type: user.type || 'internal', status: user.status, role: user.role });
  async function save() {
    await apiPATCH(`/api/users/${user.id}`, form, true);
    onSaved();
  }
  return (
    <div className="grid gap-3">
      <label className="grid gap-1"><span className="text-xs opacity-70">Ime i prezime</span><Input value={form.name} onChange={e=> setForm({ ...form, name: e.target.value })} /></label>
      <label className="grid gap-1"><span className="text-xs opacity-70">Telefon</span><Input value={form.phone} onChange={e=> setForm({ ...form, phone: e.target.value })} /></label>
      <label className="grid gap-1"><span className="text-xs opacity-70">Tip</span><Select value={form.type} onChange={(v)=> setForm({ ...form, type: v })} options={[{value:'internal',label:'Interni'},{value:'external',label:'Eksterni'}]} /></label>
      <label className="grid gap-1"><span className="text-xs opacity-70">Status</span><Select value={form.status} onChange={(v)=> setForm({ ...form, status: v })} options={["active","invited","suspended","locked"].map(s=>({ value:s, label:s }))} /></label>
      <label className="grid gap-1"><span className="text-xs opacity-70">Primarna uloga</span><Select value={form.role} onChange={(v)=> setForm({ ...form, role: v })} options={["admin","manager","magacioner","komercijalista","viewer","external"].map(r=>({ value:r, label:r }))} /></label>
      <div><Button type="primary" onClick={save}>Sačuvaj</Button></div>
    </div>
  );
}

function RBAC({ user }: { user: User }) {
  const [rolesCSV, setRolesCSV] = React.useState<string>(user.role);
  const [scope, setScope] = React.useState<string>('');
  async function save() {
    const roles = rolesCSV.split(',').map(s=>s.trim()).filter(Boolean);
    const scopeList = scope.split(',').map(s=>s.trim()).filter(Boolean);
    await apiPOST(`/api/users/${user.id}/roles`, { roles, scope: scopeList }, { auth: true });
    alert('Sačuvano');
  }
  return (
    <div className="grid gap-3">
      <label className="grid gap-1"><span className="text-xs opacity-70">Role keys (comma)</span><Input value={rolesCSV} onChange={e=> setRolesCSV(e.target.value)} /></label>
      <label className="grid gap-1"><span className="text-xs opacity-70">Scope lokacije (npr. PG,NK)</span><Input value={scope} onChange={e=> setScope(e.target.value)} /></label>
      <div><Button type="primary" onClick={save}>Primijeni</Button></div>
      <div className="text-xs opacity-70">Effective permissions (preview): read-only — generisano iz uloga + scope-a (TBD)</div>
    </div>
  );
}

function Activity({ user }: { user: User }) {
  const [rows, setRows] = React.useState<any[]>([]);
  React.useEffect(() => { (async()=>{ try{ const list = await apiGET<any[]>(`/api/users/${user.id}/audit?since=30d`, true); setRows(list||[]);}catch{}})(); }, [user.id]);
  return (
    <div className="grid gap-2">
      {rows.length===0? <div className="opacity-60 text-sm">Nema aktivnosti.</div> : rows.map((r)=> (
        <div key={r.id} className="border-b border-white/10 py-1"><div className="text-sm">{r.event}</div><div className="text-xs opacity-70">{new Date(r.created_at).toLocaleString()}</div></div>
      ))}
    </div>
  );
}

function Sessions({ user }: { user: User }) {
  const [rows, setRows] = React.useState<any[]>([]);
  const load = async ()=> { try{ const list = await apiGET<any[]>(`/api/users/${user.id}/sessions`, true); setRows(list||[]);}catch{} };
  React.useEffect(()=>{ load(); }, [user.id]);
  async function revoke(id: number) { try{ await fetch(`${import.meta.env.VITE_API_BASE?.replace(/\/$/,'') || 'http://localhost:8081'}/api/users/${user.id}/sessions/${id}`, { method:'DELETE', headers:{ Authorization:`Bearer ${localStorage.getItem('token')}` } }); await load(); }catch{} }
  async function revokeAll() { try{ await fetch(`${import.meta.env.VITE_API_BASE?.replace(/\/$/,'') || 'http://localhost:8081'}/api/users/${user.id}/sessions`, { method:'DELETE', headers:{ Authorization:`Bearer ${localStorage.getItem('token')}` } }); await load(); }catch{} }
  return (
    <div className="grid gap-2">
      <div className="flex justify-between items-center"><div className="font-medium">Aktivne sesije</div><Button onClick={revokeAll}>Revoke all</Button></div>
      {rows.length===0? <div className="opacity-60 text-sm">Nema aktivnih sesija.</div> : rows.map((s)=> (
        <div key={s.id} className="border border-white/10 rounded p-2 flex items-center justify-between">
          <div className="text-sm">
            <div><b>{s.os || 'OS'}</b> • {s.ip} • {s.ua?.slice(0,60)}</div>
            <div className="text-xs opacity-70">Last seen: {new Date(s.last_seen_at).toLocaleString()} • Kreirano: {new Date(s.created_at).toLocaleString()}</div>
          </div>
          <div><Button danger onClick={()=> revoke(s.id)}>Revoke</Button></div>
        </div>
      ))}
    </div>
  );
}

function Notifications({ user }: { user: User }) {
  const [prefs, setPrefs] = React.useState<Array<{channel:string; event_key:string; enabled:boolean; frequency:string}>>([
    { channel:'email', event_key:'arrivals.assigned', enabled:true, frequency:'instant' },
    { channel:'email', event_key:'arrivals.due_today', enabled:true, frequency:'daily' },
    { channel:'email', event_key:'container.late', enabled:true, frequency:'instant' },
  ]);
  async function save() {
    await apiPOST(`/api/users/${user.id}/notifications`, { prefs }, { auth: true });
    alert('Sačuvano');
  }
  return (
    <div className="grid gap-2">
      {prefs.map((p,idx)=> (
        <div key={idx} className="flex gap-2 items-center">
          <Select style={{ width: 120 }} value={p.channel} onChange={(v)=> setPrefs(prev=> prev.map((x,i)=> i===idx?{...x, channel:v}:x))} options={[{value:'email',label:'Email'},{value:'slack',label:'Slack'},{value:'teams',label:'Teams'}]} />
          <Input style={{ flex:1 }} value={p.event_key} onChange={(e)=> setPrefs(prev=> prev.map((x,i)=> i===idx?{...x, event_key:e.target.value}:x))} />
          <Select style={{ width: 140 }} value={p.frequency} onChange={(v)=> setPrefs(prev=> prev.map((x,i)=> i===idx?{...x, frequency:v}:x))} options={[{value:'instant',label:'Instant'},{value:'daily',label:'Dnevni digest'},{value:'weekly',label:'Sedmični pregled'}]} />
          <Select style={{ width: 120 }} value={p.enabled? 'on':'off'} onChange={(v)=> setPrefs(prev=> prev.map((x,i)=> i===idx?{...x, enabled: v==='on'}:x))} options={[{value:'on',label:'On'},{value:'off',label:'Off'}]} />
        </div>
      ))}
      <div><Button type="primary" onClick={save}>Sačuvaj</Button></div>
    </div>
  );
}

function Productivity({ user }: { user: User }) {
  const [range, setRange] = React.useState<'7d'|'30d'>('7d');
  const [data, setData] = React.useState<any | null>(null);
  const load = async ()=> { try { const d = await apiGET<any>(`/api/users/${user.id}/productivity?range=${range}`, true); setData(d); } catch {} };
  React.useEffect(()=> { load(); }, [user.id, range]);
  const series = data?.series_day || [];
  const max = Math.max(1, ...series.map((s:any)=> s.count));
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <div className="text-sm opacity-70">Raspon</div>
        <Select size="small" value={range} onChange={(v)=> setRange(v)} options={[{value:'7d',label:'7 dana'},{value:'30d',label:'30 dana'}]} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded bg-white/5 p-3"><div className="text-xs opacity-70">Obrađeno</div><div className="text-2xl font-semibold">{data?.processed ?? 0}</div></div>
        <div className="rounded bg-white/5 p-3"><div className="text-xs opacity-70">Pros. trajanje</div><div className="text-2xl font-semibold">{data?.avg_duration_minutes ? `${Math.round(data.avg_duration_minutes)} min` : '—'}</div></div>
        <div className="rounded bg-white/5 p-3"><div className="text-xs opacity-70">% on-time</div><div className="text-2xl font-semibold">{data?.on_time_pct ?? '—'}%</div></div>
      </div>
      {/* mini bar */}
      <div>
        <div className="text-xs opacity-70 mb-2">Trend (dnevno)</div>
        <div style={{ display:'flex', alignItems:'flex-end', gap:6, height: 120, padding: '6px 4px', border:'1px solid rgba(255,255,255,0.08)', borderRadius: 8 }}>
          {series.map((s:any)=> (
            <div key={s.date} title={`${s.date}: ${s.count}`} style={{ width: 10, background:'#3b82f6', height: Math.max(4, Math.round(110 * s.count / max)) }} />
          ))}
        </div>
      </div>
      {/* heatmap */}
      <div>
        <div className="text-xs opacity-70 mb-2">Heatmap (dani × sati)</div>
        <HeatmapGrid data={data?.heatmap || []} />
      </div>
    </div>
  );
}

function HeatmapGrid({ data }: { data: number[][] }) {
  const dayLabels = ['Pon','Uto','Sri','Čet','Pet','Sub','Ned'];
  const max = Math.max(1, ...data.flat());
  return (
    <div style={{ display:'grid', gridTemplateColumns: '40px repeat(24, 1fr)', gap: 4 }}>
      <div />
      {new Array(24).fill(0).map((_,h)=>(<div key={`h-${h}`} style={{ fontSize:10, textAlign:'center', opacity:.6 }}>{h}</div>))}
      {data.map((row, i)=> (
        <React.Fragment key={`r-${i}`}>
          <div style={{ fontSize:12, opacity:.8 }}>{dayLabels[i] || i}</div>
          {row.map((v, j)=> {
            const alpha = v ? (0.2 + 0.8 * (v/max)) : 0.08;
            return <div key={`c-${i}-${j}`} title={`${v}`} style={{ height: 14, borderRadius: 3, background: `rgba(59,130,246,${alpha})` }} />
          })}
        </React.Fragment>
      ))}
    </div>
  );
}

function NotesFiles({ user }: { user: User }) {
  const [notes, setNotes] = React.useState<Array<{id:number;text:string;created_at:string;author_id?:number}>>([]);
  const [files, setFiles] = React.useState<Array<{id:number;label?:string;url:string;created_at:string}>>([]);
  const [text, setText] = React.useState('');
  const load = async ()=> {
    try { const ns = await apiGET<any[]>(`/api/users/${user.id}/notes`, true); setNotes(ns||[]); } catch {}
    try { const fs = await apiGET<any[]>(`/api/users/${user.id}/files`, true); setFiles(fs||[]); } catch {}
  };
  React.useEffect(()=>{ load(); }, [user.id]);
  async function addNote() {
    if (!text.trim()) return;
    await apiPOST(`/api/users/${user.id}/notes`, { text }, { auth: true });
    setText('');
    load();
  }
  async function delNote(id: number) { await fetch(`${import.meta.env.VITE_API_BASE?.replace(/\/$/,'') || 'http://localhost:8081'}/api/users/${user.id}/notes/${id}`, { method:'DELETE', headers:{ Authorization:`Bearer ${localStorage.getItem('token')}` } }); load(); }
  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const fd = new FormData(); fd.append('file', f);
    await apiUPLOAD(`/api/users/${user.id}/files`, fd, true);
    e.currentTarget.value = '';
    load();
  }
  async function delFile(id: number) { await fetch(`${import.meta.env.VITE_API_BASE?.replace(/\/$/,'') || 'http://localhost:8081'}/api/users/${user.id}/files/${id}`, { method:'DELETE', headers:{ Authorization:`Bearer ${localStorage.getItem('token')}` } }); load(); }
  return (
    <div className="grid gap-4">
      <div>
        <div className="font-medium mb-2">Napomene</div>
        <div className="flex gap-2">
          <Input placeholder="Dodaj napomenu" value={text} onChange={(e)=> setText(e.target.value)} onPressEnter={addNote} />
          <Button type="primary" onClick={addNote}>Dodaj</Button>
        </div>
        <div className="grid gap-2 mt-3">
          {notes.length===0? <div className="text-sm opacity-60">Nema napomena.</div> : notes.map(n=> (
            <div key={n.id} className="border border-white/10 rounded p-2 flex justify-between items-start">
              <div>
                <div className="text-sm">{n.text}</div>
                <div className="text-xs opacity-60">{new Date(n.created_at).toLocaleString()}</div>
              </div>
              <Button size="small" danger onClick={()=> delNote(n.id)}>Obriši</Button>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="font-medium mb-2">Prilozi</div>
        <div className="flex items-center gap-2">
          <input type="file" onChange={onUpload} />
        </div>
        <div className="grid gap-2 mt-3">
          {files.length===0? <div className="text-sm opacity-60">Nema fajlova.</div> : files.map(f => (
            <div key={f.id} className="border border-white/10 rounded p-2 flex justify-between items-center">
              <a href={f.url} target="_blank" rel="noreferrer" className="text-blue-400">{f.label || f.url.split('/').pop()}</a>
              <Button size="small" danger onClick={()=> delFile(f.id)}>Obriši</Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CreateUser({ onCreated }: { onCreated: ()=>void }) {
  const [form, setForm] = React.useState<{ name:string; email:string; role:Role; phone?:string; locations?:string; temporary?:boolean }>({ name:'', email:'', role:'viewer', phone:'', locations:'', temporary:true });
  const [creating, setCreating] = React.useState(false);
  async function submit() {
    setCreating(true);
    try {
      const body: any = { name: form.name, email: form.email, role: form.role, phone: form.phone, require_password_change: form.temporary };
      if (form.locations) body.locations = form.locations.split(',').map(s=>s.trim()).filter(Boolean);
      const res = await apiPOST<any>(`/api/users`, body, { auth: true });
      if (res?.temporary_password) {
        alert(`Privremena lozinka: ${res.temporary_password}`);
      }
      onCreated();
    } catch (e:any) {
      alert(e?.message || 'Greška');
    } finally { setCreating(false); }
  }
  return (
    <div className="grid gap-3">
      <label className="grid gap-1"><span className="text-xs opacity-70">Ime i prezime</span><Input value={form.name} onChange={(e)=> setForm({...form, name: e.target.value})} /></label>
      <label className="grid gap-1"><span className="text-xs opacity-70">Email</span><Input type="email" value={form.email} onChange={(e)=> setForm({...form, email: e.target.value})} /></label>
      <label className="grid gap-1"><span className="text-xs opacity-70">Telefon</span><Input value={form.phone} onChange={(e)=> setForm({...form, phone: e.target.value})} /></label>
      <label className="grid gap-1"><span className="text-xs opacity-70">Uloga</span><Select value={form.role} onChange={(v)=> setForm({...form, role: v})} options={["admin","manager","magacioner","komercijalista","viewer","external"].map(r=>({ value:r, label:r })) as any} /></label>
      <label className="grid gap-1"><span className="text-xs opacity-70">Lokacije (CSV)</span><Input value={form.locations} onChange={(e)=> setForm({...form, locations: e.target.value})} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.temporary} onChange={(e)=> setForm({...form, temporary: e.target.checked})} /> Privremena lozinka + zahtjev promjene</label>
      <div className="pt-2"><Button type="primary" loading={creating} onClick={submit}>Kreiraj</Button></div>
    </div>
  );
}
