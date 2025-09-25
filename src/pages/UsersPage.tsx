import React from 'react';
import { apiGET, apiPOST, apiPATCH, apiUPLOAD, apiDELETE } from '../api/client';
import { Table, Tag, Drawer, Tabs, Button, Input, Select, Space, Dropdown, DatePicker, Badge, Upload, message, Spin, Modal, Form, Checkbox } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { EyeOutlined, EditOutlined, RedoOutlined, StopOutlined, DeleteOutlined, LockOutlined, UnlockOutlined, MoreOutlined, SearchOutlined, FilterOutlined, SaveOutlined, UploadOutlined } from '@ant-design/icons';
import { t } from '../lib/i18n';
import './UsersPage.css';
// Using local inline tab components; remove conflicting parts import
// import { ProfileTab, RBAC, Activity, Sessions, Productivity, NotesFiles } from './UsersPage.parts';

const { TextArea } = Input;

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

// API response types
type ApiUsersResp = User[] | { items: User[]; total: number };
type AuditEvent = { id: number; event: string; created_at: string };
type UserSession = { id: number; os?: string; ip?: string; ua?: string; last_seen_at: string; created_at: string };
// type UserNote = { id: number; text: string; created_at: string; author_id?: number };
// type UserFile = { id: number; label?: string; url: string; created_at: string };
type ImportReport = { created: number; updated: number; errors?: Array<{ row?: number; message: string }>; };

// Request payload types
type UpdateUserPayload = { name?: string; phone?: string; type?: 'internal'|'external'; status?: Status; role?: Role };
type BulkStatusPayload = { ids: number[]; status: Status };
type UserRolesPayload = { roles: string[]; scope: string[] };
type NotificationsPayload = { prefs: Array<{ channel:string; event_key:string; enabled:boolean; frequency:string }> };

// type ProfileTabProps = { user: User; onSaved: () => void };

const fmtDate = (iso?: string) => iso? new Date(iso).toLocaleString('sr-RS', { timeZone: 'Europe/Podgorica' }): '';

type ProfileTabHandle = { submit: () => Promise<void>; };
type RBACTabHandle = { submit: () => Promise<void>; };
type NotificationsTabHandle = { submit: () => Promise<void>; };

type ProfileTabProps = { user: User; onSaved: () => void };
type RBACTabProps = { user: User };
type NotificationsTabProps = { user: User };

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
  const [views, setViews] = React.useState<Array<{ name:string; data:any }>>(()=>{ try { return JSON.parse(localStorage.getItem('users_views')||'[]'); } catch { return []; } });
  const [, setCurrentView] = React.useState<string | undefined>(undefined);
  const [colOrder, setColOrder] = React.useState<string[]>(()=>{ try { return JSON.parse(localStorage.getItem('users_col_order')||'[]'); } catch { return []; } });
  const [importOpen, setImportOpen] = React.useState(false);
  const [importReport, setImportReport] = React.useState<ImportReport | null>(null);
  const [importFile, setImportFile] = React.useState<File | null>(null);
  const [sort, setSort] = React.useState<{ field?: string; order?: 'ascend' | 'descend' }>({});
  const [activeTab, setActiveTab] = React.useState<string>('profile');
  const profileRef = React.useRef<ProfileTabHandle | null>(null);
  const rbacRef = React.useRef<RBACTabHandle | null>(null);
  const notificationsRef = React.useRef<NotificationsTabHandle | null>(null);
  const [userModalSaving, setUserModalSaving] = React.useState(false);

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
      if (sort?.field && sort?.order) {
        qs.set('sort', `${sort.field}:${sort.order === 'ascend' ? 'asc' : 'desc'}`);
      }
      const data = await apiGET<ApiUsersResp>(`/api/users${qs.toString()?`?${qs.toString()}`:''}`, true);
      if (Array.isArray(data)) { setRows(data); setTotal(undefined); }
      else { setRows(data?.items || []); setTotal(data?.total); }
    } catch (e:any) {
      const msg = String(e?.message || e);
      if (/401/.test(msg)) message.error('Potrebna je prijava'); else message.error(msg);
    } finally { setLoading(false); }
  }, [roleFilter, statusFilter, range, page, pageSize, advanced, sort]);

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

  let columns: ColumnsType<User> = [
    {
      title: 'Korisnik', dataIndex: 'name', key: 'name', width: 280, hidden: colVis.name === false, responsive:['xs','sm','md','lg','xl','xxl'], sorter: true,
      sortOrder: sort.field === 'name' ? sort.order : null,
      render: (_, r) => (
        <div className="um-user-cell">
          <div className="um-avatar">{(r.name || r.email).slice(0,1).toUpperCase()}</div>
          <div className="um-user-cell-body">
            <div className="um-user-name" title={r.name || r.email}>{r.name || '(bez imena)'}</div>
            <div className="um-user-meta">
              <span className="um-user-email" title={r.email}>{r.email}</span>
              {r.username ? <span className="um-user-username" title={r.username}>• {r.username}</span> : null}
            </div>
          </div>
        </div>
      ),
      onHeaderCell: () => ({ className: 'um-users-header' }),
      onCell: () => ({ className: 'um-users-cell um-users-cell--primary' })
    },
    { title: 'Email', dataIndex: 'email', key: 'email', width: 240, hidden: colVis.email === false, ellipsis: { showTitle: false }, responsive:['md'], sorter: true, sortOrder: sort.field === 'email' ? sort.order : null, render: (v:string)=> <span className="um-user-email" title={v}>{v}</span>, onHeaderCell: () => ({ className: 'um-users-header' }), onCell: () => ({ className: 'um-users-cell', style: { minWidth: 240 } }) },
    { title: 'Uloga', dataIndex: 'role', key: 'role', width: 140, hidden: colVis.role === false, responsive:['sm'], sorter: true, sortOrder: sort.field === 'role' ? sort.order : null,
      render: (v: Role) => <Tag style={{ borderRadius:999, padding:'0 8px', fontWeight:600 }} color={v==='admin'?'geekblue':v==='manager'?'green':v==='viewer'?'default':'blue'}>{v}</Tag>
    },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 140, hidden: colVis.status === false, responsive:['sm'], sorter: true, sortOrder: sort.field === 'status' ? sort.order : null,
      render: (s: Status) => {
        const color = s==='active'?'#16A34A': s==='suspended'?'#6B7280': s==='locked'?'#F59E0B': '#3B82F6';
        const bg = s==='active'?'#DCFCE7': s==='suspended'?'#F3F4F6': s==='locked'?'#FEF3C7': '#DBEAFE';
        return <span style={{ background:bg, color, borderRadius:999, padding:'2px 10px', fontSize:12, fontWeight:600 }}>{s}</span>;
      }
    },
    { title: 'Pi', dataIndex: 'kpi_7d', key: 'kpi', width: 100, align: 'center', hidden: colVis.kpi === false, responsive:['md'], render: (k:any)=> <span style={{ fontSize:12, fontWeight:600 }}>{k?.processed ?? 0}</span> },
    { title: 'Zadnja aktivnost', dataIndex: 'last_activity_at', key: 'last_activity_at', width: 240, hidden: colVis.last_activity_at === false, responsive:['md'], sorter: true, sortOrder: sort.field === 'last_activity_at' ? sort.order : null,
      render: (v?: string) => {
        if (!v) return null;
        const days = Math.max(0, Math.floor((Date.now() - new Date(v).getTime()) / (1000*60*60*24)));
        const good = days <= 7; const warn = days > 7 && days <= 30;
        const color = good? '#16A34A' : warn? '#F59E0B' : '#EF4444';
        const pct = Math.min(100, Math.round((30 - Math.min(days,30)) / 30 * 100));
        return (
          <div title={new Date(v).toISOString()} className="um-activity-meter">
            <div className="um-activity-meter-track">
              <div style={{ width: `${pct}%`, background: color }} />
            </div>
            <span>{days}d</span>
          </div>
        );
      }
    },
    { title: 'Zadaci danas', dataIndex: 'tasks_today', key: 'tasks_today', width: 120, align: 'right', hidden: colVis.tasks_today === false, responsive:['lg'], sorter: true, sortOrder: sort.field === 'tasks_today' ? sort.order : null },
    { title: 'KPI 7d', dataIndex: 'kpi_7d', key: 'kpi_7d', width: 180, hidden: colVis.kpi2 === false, responsive:['lg'],
      render: (k: any) => (
        <div style={{ fontSize:12 }}>
          <div>Obrađeno: <b>{k?.processed ?? 0}</b></div>
        </div>
      )
    },
    { title: '', key: 'actions', fixed: 'right', width: 72,
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
              if (key==='view' || key==='edit') {
                setActiveTab('profile');
                setDrawer({ open:true, user:r });
              }
              if (key==='reset') {
                const resp = await apiPOST<any>(`/api/users/${r.id}/password/reset`, { generate_temp: true }, { auth: true });
                if (resp?.temp_password) message.success(`Privremena lozinka: ${resp.temp_password}`);
                else message.success('Privremena lozinka generisana');
              }
              if (key==='toggle') {
                const status: Status = r.status==='active' ? 'suspended' : 'active';
                const payload: BulkStatusPayload = { ids: [r.id], status };
                await apiPOST<void>(`/api/users/bulk/status`, payload, { auth: true });
                fetchList();
              }
              if (key==='lock') { await apiPOST(`/api/users/${r.id}/lock`, {}, { auth: true }); fetchList(); }
              if (key==='revoke') {
                const token = localStorage.getItem('token');
                if (!token) { message.error('Potrebna je prijava'); return; }
                await fetch(`${import.meta.env.VITE_API_BASE?.replace(/\/$/,'') || 'http://localhost:8081'}/api/users/${r.id}/sessions`, { method:'DELETE', headers:{ Authorization:`Bearer ${token}` } });
                message.success('Sesije su poništene');
              }
              if (key==='delete') {
                if (!confirm('Soft delete this user?')) return;
                await apiDELETE(`/api/users/${r.id}`, true);
                fetchList();
              }
            } }}
            trigger={["click"]}
          >
            <Button type="text" size="small" className="um-users-action" icon={<MoreOutlined />} />
          </Dropdown>
        );
      }
    }
  ];

  // Apply saved column order if present
  if (colOrder && colOrder.length) {
    const map: Record<string, any> = {};
    (columns as any[]).forEach((c:any)=> { if (c.key) map[c.key] = c; });
    const ordered = colOrder.map(k => map[k]).filter(Boolean);
    const rest = (columns as any[]).filter((c:any) => !colOrder.includes(c.key as string));
    columns = [...ordered, ...rest] as any;
  }

  // const selected = rows.filter(r => selectedKeys.includes(r.id));
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
    <div className="um-page">
      <div className="um-container">
        {/* Zaglavlje */}
        <div className="um-header">
          <div className="um-title">Upravljanje korisnicima</div>
          <div className="um-actions">
            <Dropdown
              menu={{ items: [
                { key:'save', icon:<SaveOutlined />, label: 'Sačuvaj prikaz', onClick: ()=> { const name = prompt('Naziv prikaza'); if (!name) return; const data = { q, roleFilter, statusFilter, range, density, advanced, colVis, colOrder }; const next = [...views.filter(v=>v.name!==name), { name, data }]; setViews(next); localStorage.setItem('users_views', JSON.stringify(next)); setCurrentView(name); } },
                ...views.map(v=> ({ key:`view-${v.name}`, label: v.name, onClick: ()=> { const d=v.data; setQ(d.q); setRoleFilter(d.roleFilter); setStatusFilter(d.statusFilter); setRange(d.range); setDensity(d.density); setAdvanced(d.advanced); setColVis(d.colVis); setColOrder(d.colOrder || []); setCurrentView(v.name); setPage(1); fetchList(); } })),
              ]}}
            >
              <Button className="um-btn-ghost" aria-label="Sačuvani prikazi">Sačuvani prikazi</Button>
            </Dropdown>
            <Button className="um-btn-ghost" icon={<UploadOutlined />} onClick={()=> { setImportOpen(true); setImportReport(null); }}>Import</Button>
            <Button className="um-btn-secondary" icon={<FilterOutlined />} onClick={()=> setFiltersOpen(true)}>
              Filteri {activeFilterCount? <Badge count={activeFilterCount} />: null}
            </Button>
            <Button className="um-btn-primary" onClick={()=> setCreateOpen(true)} aria-label="Dodaj novog korisnika">+ Novi korisnik</Button>
          </div>
        </div>

        {/* Kartice s metrikama */}
        <div className="um-metrics">
          <div className="um-card"><div className="um-card-title">Aktivni korisnici (7d)</div><div className="um-card-value">{kpiActive7d}</div></div>
          <div className="um-card"><div className="um-card-title">Pros. # obrađenih (7d)</div><div className="um-card-value">{avgProcessed7d}</div></div>
          <div className="um-card"><div className="um-card-title">% na vrijeme (7d)</div><div className="um-card-value">{onTimePct}%</div></div>
          <div className="um-card"><div className="um-card-title">Otvoreni zadaci danas</div><div className="um-card-value">{tasksToday}</div></div>
        </div>

        {/* Pretraga */}
        <div className="um-search">
          <Input size="large" allowClear placeholder="Pretraga korisnika…" prefix={<SearchOutlined />} aria-label="Pretraga korisnika" value={q} onChange={(e)=> setQ(e.target.value)} />
        </div>

        {/* Tabela */}
        <div className="um-table-card">
          <Table
            className="um-users-table"
            rowKey="id"
            size={density}
            tableLayout="fixed"
            sticky
            loading={loading}
            dataSource={filtered}
            columns={columns}
            scroll={{ x: 1100 }}
            onChange={(_, __, s) => {
              const so = Array.isArray(s) ? s[0] : s;
              setSort({ field: (so?.field as string) || undefined, order: (so?.order as any) || undefined });
              setPage(1);
            }}
            pagination={{ current: page, pageSize, total: total ?? filtered.length, showSizeChanger: true, onChange: (p, ps)=> { setPage(p); setPageSize(ps); } }}
            rowSelection={{ selectedRowKeys: selectedKeys, onChange: (keys)=> setSelectedKeys(keys as number[]) }}
            rowClassName={() => 'um-users-row'}
            onRow={(r)=> ({ onClick: ()=> setDrawer({ open: true, user: r }) })}
          />
        </div>
      </div>
      {/* Filters drawer */}
      <Drawer className="um-drawer" title="Filteri" placement="right" width={360} onClose={()=> setFiltersOpen(false)} open={filtersOpen} destroyOnClose>
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
      {/* Create modal */}
      <Modal
        className="create-user-modal"
        title="Novi korisnik"
        open={createOpen}
        width={680}
        centered
        destroyOnClose
        footer={null}
        onCancel={()=> setCreateOpen(false)}
      >
        <CreateUser
          onCreated={()=> { setCreateOpen(false); fetchList(); }}
          onCancel={()=> setCreateOpen(false)}
        />
      </Modal>
      {/* User modal */}
      <Modal
        className="user-detail-modal"
        open={drawer.open}
        width={960}
        destroyOnClose
        maskClosable={!userModalSaving}
        closable={!userModalSaving}
        onCancel={() => {
          if (userModalSaving) return;
          setDrawer({ open: false });
          setActiveTab('profile');
        }}
        footer={null}
        title={drawer.user ? (
          <div className="user-detail-modal__title-wrap">
            <div className="user-detail-modal__title">{drawer.user.name || drawer.user.email}</div>
            <div className="user-detail-modal__subtitle">{drawer.user.email}</div>
          </div>
        ) : null}
        bodyStyle={{ padding: 0 }}
      >
        {drawer.user ? (
          <div className="user-detail-modal__content">
            <div className="user-detail-modal__tabs">
              <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                items={[
                  { key: 'profile', label: 'Profil' },
                  { key: 'rbac', label: 'Prava' },
                  { key: 'activity', label: 'Aktivnost' },
                  { key: 'sessions', label: 'Sesije/Uređaji' },
                  { key: 'notifications', label: 'Notifikacije' },
                ]}
              />
            </div>
            <div className="user-detail-modal__body" id="user-detail-scroll">
              {activeTab === 'profile' && (
                <ProfileTab ref={profileRef} user={drawer.user} onSaved={fetchList} />
              )}
              {activeTab === 'rbac' && (
                <RBAC ref={rbacRef} user={drawer.user} />
              )}
              {activeTab === 'activity' && (
                <Activity user={drawer.user} />
              )}
              {activeTab === 'sessions' && (
                <Sessions user={drawer.user} />
              )}
              {activeTab === 'notifications' && (
                <Notifications ref={notificationsRef} user={drawer.user} />
              )}
            </div>
            <div className="user-detail-modal__footer">
              <Button onClick={() => {
                if (userModalSaving) return;
                setDrawer({ open: false });
                setActiveTab('profile');
              }}>Otkaži</Button>
              <Button
                type="primary"
                loading={userModalSaving}
                onClick={async () => {
                  const handler = activeTab === 'profile'
                    ? profileRef.current
                    : activeTab === 'rbac'
                      ? rbacRef.current
                      : activeTab === 'notifications'
                        ? notificationsRef.current
                        : null;
                  if (!handler?.submit) {
                    return;
                  }
                  try {
                    setUserModalSaving(true);
                    await handler.submit();
                  } catch (error: any) {
                    const detail = error?.message || 'Greška pri snimanju';
                    message.error(detail);
                  } finally {
                    setUserModalSaving(false);
                  }
                }}
                disabled={!['profile', 'rbac', 'notifications'].includes(activeTab)}
              >
                Sačuvaj
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
      {/* Import drawer */}
      <Drawer className="um-drawer" title={t('import') || 'Import'} placement="right" width={420} onClose={()=> { setImportOpen(false); setImportReport(null); setImportFile(null); }} open={importOpen} destroyOnClose>
        <div className="grid gap-3">
          <Upload beforeUpload={async (file) => { setImportFile(file as File); const fd = new FormData(); fd.append('file', file); try { const rep = await apiUPLOAD<ImportReport>(`/api/users/import?dry_run=1`, fd, true); setImportReport(rep); message.success('Preflight completed'); } catch (e:any) { message.error(e?.message || 'Import failed'); } return false; }}>
            <Button icon={<UploadOutlined />}>{t('upload_csv') || 'Upload CSV'}</Button>
          </Upload>
          {importReport && (
            <div className="grid gap-2">
              <div className="font-medium">{t('preflight') || 'Preflight'}</div>
              <div className="text-sm">{t('rows_created') || 'Rows created'}: {importReport.created} • {t('rows_updated') || 'Rows updated'}: {importReport.updated}</div>
              {!!(importReport.errors||[]).length && (
                <div className="text-sm" style={{ color:'#EF4444' }}>{t('errors') || 'Errors'}: {(importReport.errors||[]).length}</div>
              )}
              <div>
                <Button type="primary" disabled={!importFile} onClick={async()=>{ if (!importFile) return; try { const fd = new FormData(); fd.append('file', importFile); const res = await apiUPLOAD<ImportReport>(`/api/users/import`, fd, true); message.success(`Imported: created ${res.created}, updated ${res.updated}`); setImportReport(null); setImportFile(null); setImportOpen(false); fetchList(); } catch(e:any) { message.error(e?.message || 'Import failed'); } }}>{t('confirm_import') || 'Confirm Import'}</Button>
              </div>
            </div>
          )}
        </div>
      </Drawer>
    </div>
  );
}

const ProfileTab = React.forwardRef<ProfileTabHandle, ProfileTabProps>(({ user, onSaved }, ref) => {
  const [form, setForm] = React.useState<UpdateUserPayload>({ name: user.name || '', phone: user.phone || '', type: user.type || 'internal', status: user.status, role: user.role });

  React.useEffect(() => {
    setForm({ name: user.name || '', phone: user.phone || '', type: user.type || 'internal', status: user.status, role: user.role });
  }, [user.id, user.name, user.phone, user.role, user.status, user.type]);

  const submit = React.useCallback(async () => {
    await apiPATCH(`/api/users/${user.id}`, form, true);
    message.success('Profil sačuvan');
    onSaved();
  }, [form, onSaved, user.id]);

  React.useImperativeHandle(ref, () => ({ submit }), [submit]);

  return (
    <div className="um-section">
      <div className="um-section-title">Profil</div>
      <div className="um-form-grid">
        <div className="um-field">
          <label className="um-label">Ime i prezime</label>
          <Input size="large" value={form.name} onChange={e=> setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="um-field">
          <label className="um-label">Telefon</label>
          <Input size="large" value={form.phone} onChange={e=> setForm({ ...form, phone: e.target.value })} />
        </div>
        <div className="um-field">
          <label className="um-label">Tip</label>
          <Select
            size="large"
            value={form.type}
            onChange={(v)=> setForm({ ...form, type: v })}
            options={[{value:'internal',label:'Interni'},{value:'external',label:'Eksterni'}]}
            getPopupContainer={() => document.body}
          />
        </div>
        <div className="um-field">
          <label className="um-label">Status</label>
          <Select
            size="large"
            value={form.status}
            onChange={(v)=> setForm({ ...form, status: v })}
            options={["active","invited","suspended","locked"].map(s=>({ value:s, label:s }))}
            getPopupContainer={() => document.body}
          />
        </div>
        <div className="um-field">
          <label className="um-label">Primarna uloga</label>
          <Select
            size="large"
            value={form.role}
            onChange={(v)=> setForm({ ...form, role: v })}
            options={["admin","manager","magacioner","komercijalista","viewer","external"].map(r=>({ value:r, label:r }))}
            getPopupContainer={() => document.body}
          />
        </div>
      </div>
    </div>
  );
});
ProfileTab.displayName = 'ProfileTab';

const RBAC = React.forwardRef<RBACTabHandle, RBACTabProps>(({ user }, ref) => {
  const [rolesCSV, setRolesCSV] = React.useState<string>(user.role);
  const [scope, setScope] = React.useState<string>('');

  React.useEffect(() => {
    setRolesCSV(user.role);
    setScope('');
  }, [user.id, user.role]);

  const submit = React.useCallback(async () => {
    const roles = rolesCSV.split(',').map(s=>s.trim()).filter(Boolean);
    const scopeList = scope.split(',').map(s=>s.trim()).filter(Boolean);
    const payload: UserRolesPayload = { roles, scope: scopeList };
    await apiPOST<void>(`/api/users/${user.id}/roles`, payload, { auth: true });
    message.success('Prava su ažurirana');
  }, [rolesCSV, scope, user.id]);

  React.useImperativeHandle(ref, () => ({ submit }), [submit]);

  return (
    <div className="user-tab-stack">
      <div className="um-section">
        <div className="um-section-title">Uloge</div>
        <div className="um-form-grid">
          <div className="um-field">
            <label className="um-label">Role keys (CSV)</label>
            <Input size="large" value={rolesCSV} onChange={e=> setRolesCSV(e.target.value)} placeholder="npr. admin,viewer" allowClear />
          </div>
          <div className="um-field">
            <label className="um-label">Scope lokacije (CSV)</label>
            <Input size="large" value={scope} onChange={e=> setScope(e.target.value)} placeholder="PG,NK" allowClear />
            <div className="um-help">Odvojite lokacije zarezom (npr. PG,NK)</div>
          </div>
        </div>
      </div>
      <div className="um-section">
        <div className="um-section-title">Effective permissions</div>
        <p className="user-permissions-copy">
          Prikazuje kombinovana pravila i ograničenja na osnovu izabranih uloga i scope-a. Polje je read-only i automatski se osvježava nakon snimanja iznad.
        </p>
      </div>
    </div>
  );
});
RBAC.displayName = 'RBAC';

function Activity({ user }: { user: User }) {
  const [rows, setRows] = React.useState<AuditEvent[]>([]);
  const [loading, setLoading] = React.useState(false);
  React.useEffect(() => { (async()=>{ setLoading(true); try{ const list = await apiGET<any[]>(`/api/users/${user.id}/audit?since=30d`, true); setRows(list||[]);}catch(e:any){ message.error(e?.message||'Greška pri učitavanju aktivnosti'); } finally { setLoading(false); } })(); }, [user.id]);
  return (
    <div className="um-section">
      <div className="um-section-title">Aktivnost</div>
      {loading ? (
        <div className="activity-loading"><Spin /></div>
      ) : rows.length === 0 ? (
        <div className="activity-empty">Nema zabilježene aktivnosti u posljednjih 30 dana.</div>
      ) : (
        <div className="activity-list">
          {rows.map((r: AuditEvent)=> (
            <div key={r.id} className="activity-item">
              <div className="activity-item__event" title={r.event}>{r.event}</div>
              <div className="activity-item__time">{fmtDate(r.created_at)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Sessions({ user }: { user: User }) {
  const [rows, setRows] = React.useState<UserSession[]>([]);
  const [loading, setLoading] = React.useState(false);
  const load = async () => {
    setLoading(true);
    try {
      const list = await apiGET<any[]>(`/api/users/${user.id}/sessions`, true);
      setRows(list || []);
    } catch (e: any) {
      message.error(e?.message || 'Greška pri učitavanju sesija');
    } finally {
      setLoading(false);
    }
  };
  React.useEffect(()=>{ load(); }, [user.id]);

  async function revoke(id: number) {
    const token = localStorage.getItem('token');
    if (!token) { message.error('Potrebna je prijava'); return; }
    try {
      await fetch(`${import.meta.env.VITE_API_BASE?.replace(/\/$/,'') || 'http://localhost:8081'}/api/users/${user.id}/sessions/${id}`, { method:'DELETE', headers:{ Authorization:`Bearer ${token}` } });
      message.success('Sesija je poništena');
      await load();
    } catch {}
  }

  async function revokeAll() {
    const token = localStorage.getItem('token');
    if (!token) { message.error('Potrebna je prijava'); return; }
    try {
      await fetch(`${import.meta.env.VITE_API_BASE?.replace(/\/$/,'') || 'http://localhost:8081'}/api/users/${user.id}/sessions`, { method:'DELETE', headers:{ Authorization:`Bearer ${token}` } });
      message.success('Sve sesije su poništene');
      await load();
    } catch {}
  }

  return (
    <div className="user-tab-stack">
      <div className="um-section session-section">
        <div className="session-section__header">
          <div>
            <div className="um-section-title" style={{ marginBottom: 4 }}>Aktivne sesije</div>
            <div className="um-help">Aktuelne prijave uređaja i preglednika.</div>
          </div>
          <Button onClick={revokeAll}>Poništi sve</Button>
        </div>
        {loading ? (
          <div className="session-section__loading"><Spin /></div>
        ) : rows.length === 0 ? (
          <div className="session-section__empty">Nema aktivnih sesija.</div>
        ) : (
          <div className="session-cards">
            {rows.map((s: UserSession)=> (
              <div key={s.id} className="session-card">
                <div className="session-card__meta">
                  <div className="session-card__title">{s.os || 'Nepoznat uređaj'}</div>
                  <div className="session-card__line">IP: {s.ip || '—'}</div>
                  <div className="session-card__line" title={s.ua || ''}>UA: {s.ua || '—'}</div>
                  <div className="session-card__line">Zadnja aktivnost: {fmtDate(s.last_seen_at)} • Kreirano: {fmtDate(s.created_at)}</div>
                </div>
                <Button onClick={()=> revoke(s.id)}>Poništi</Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const Notifications = React.forwardRef<NotificationsTabHandle, NotificationsTabProps>(({ user }, ref) => {
  const [prefs, setPrefs] = React.useState<Array<{channel:string; event_key:string; enabled:boolean; frequency:string}>>([
    { channel:'email', event_key:'arrivals.assigned', enabled:true, frequency:'instant' },
    { channel:'email', event_key:'arrivals.due_today', enabled:true, frequency:'daily' },
    { channel:'email', event_key:'container.late', enabled:true, frequency:'instant' },
  ]);

  React.useEffect(() => {
    setPrefs([
      { channel:'email', event_key:'arrivals.assigned', enabled:true, frequency:'instant' },
      { channel:'email', event_key:'arrivals.due_today', enabled:true, frequency:'daily' },
      { channel:'email', event_key:'container.late', enabled:true, frequency:'instant' },
    ]);
  }, [user.id]);

  const submit = React.useCallback(async () => {
    const payload: NotificationsPayload = { prefs };
    await apiPOST<void>(`/api/users/${user.id}/notifications`, payload, { auth: true });
    message.success('Notifikacije su ažurirane');
  }, [prefs, user.id]);

  React.useImperativeHandle(ref, () => ({ submit }), [submit]);

  return (
    <div className="um-section">
      <div className="um-section-title">Notifikacije</div>
      <div className="notifications-grid">
        {prefs.map((p,idx)=> (
          <div key={idx} className="notifications-grid__row">
            <div className="um-field">
              <label className="um-label">Kanal</label>
              <Select
                size="large"
                value={p.channel}
                onChange={(v)=> setPrefs(prev=> prev.map((x,i)=> i===idx?{...x, channel:v}:x))}
                options={[{value:'email',label:'Email'},{value:'slack',label:'Slack'},{value:'teams',label:'Teams'}]}
                getPopupContainer={() => document.body}
              />
            </div>
            <div className="um-field notifications-grid__event">
              <label className="um-label">Događaj (event key)</label>
              <TextArea
                autoSize={{ minRows: 1, maxRows: 3 }}
                value={p.event_key}
                onChange={(e)=> setPrefs(prev=> prev.map((x,i)=> i===idx?{...x, event_key:e.target.value}:x))}
                placeholder="npr. arrivals.due_today"
              />
            </div>
            <div className="um-field">
              <label className="um-label">Učestalost</label>
              <Select
                size="large"
                value={p.frequency}
                onChange={(v)=> setPrefs(prev=> prev.map((x,i)=> i===idx?{...x, frequency:v}:x))}
                options={[{value:'instant',label:'Instant'},{value:'daily',label:'Dnevni digest'},{value:'weekly',label:'Sedmični pregled'}]}
                getPopupContainer={() => document.body}
              />
            </div>
            <div className="um-field">
              <label className="um-label">Status</label>
              <Select
                size="large"
                value={p.enabled? 'on':'off'}
                onChange={(v)=> setPrefs(prev=> prev.map((x,i)=> i===idx?{...x, enabled: v==='on'}:x))}
                options={[{value:'on',label:'On'},{value:'off',label:'Off'}]}
                getPopupContainer={() => document.body}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});
Notifications.displayName = 'Notifications';
function CreateUser({ onCreated, onCancel }: { onCreated: ()=>void; onCancel: ()=>void }) {
  const [form] = Form.useForm();
  const passwordValue = Form.useWatch('password', form);
  const [creating, setCreating] = React.useState(false);

  React.useEffect(() => {
    if (passwordValue) {
      form.setFieldsValue({ temporary: false });
    }
  }, [passwordValue, form]);

  const handleFinish = async (values: { name: string; email: string; phone?: string; password?: string; role: Role; locations?: string; temporary: boolean }) => {
    setCreating(true);
    try {
      const payload: Record<string, unknown> = {
        name: values.name,
        email: values.email,
        role: values.role,
        phone: values.phone,
        require_password_change: values.temporary,
      };
      if (values.password) {
        payload.password = values.password;
      }
      if (values.locations) {
        payload.locations = values.locations
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);
      }

      const res = await apiPOST<any>(`/api/users`, payload, { auth: true });
      if (res?.temporary_password) {
        message.success(`Privremena lozinka: ${res.temporary_password}`);
      } else {
        message.success('Korisnik je uspješno kreiran');
      }
      form.resetFields();
      onCreated();
    } catch (e: any) {
      message.error(e?.message || 'Greška pri kreiranju korisnika');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={{ role: 'viewer', temporary: true }}
      onFinish={handleFinish}
      className="create-user-form"
    >
      <div className="create-user-grid">
        <Form.Item
          label="Ime i prezime"
          name="name"
          rules={[{ required: true, message: 'Unesite ime i prezime' }]}
        >
          <Input size="large" placeholder="npr. Marko Marković" autoFocus />
        </Form.Item>
        <Form.Item
          label="Email"
          name="email"
          rules={[{ required: true, message: 'Unesite email adresu' }, { type: 'email', message: 'Unesite validan email' }]}
        >
          <Input size="large" type="email" placeholder="ime.prezime@firma.com" />
        </Form.Item>
        <Form.Item label="Telefon" name="phone">
          <Input size="large" placeholder="npr. +382 67 123 456" />
        </Form.Item>
        <Form.Item
          label="Lozinka (opciono)"
          name="password"
          tooltip="Ostavite prazno za automatsku privremenu lozinku"
        >
          <Input.Password size="large" placeholder="Postavite privremenu lozinku" autoComplete="new-password" />
        </Form.Item>
        <Form.Item
          label="Lokacije (CSV)"
          name="locations"
          tooltip="Opcionalno: odvojite lokacije zarezom (npr. PG, NK, BD)"
        >
          <Input size="large" placeholder="PG, NK, BD" />
        </Form.Item>
        <Form.Item
          label="Uloga"
          name="role"
          rules={[{ required: true, message: 'Odaberite ulogu' }]}
        >
          <Select
            size="large"
            options={[
              { value: 'admin', label: 'Administrator' },
              { value: 'manager', label: 'Manager' },
              { value: 'magacioner', label: 'Magacioner' },
              { value: 'komercijalista', label: 'Komercijalista' },
              { value: 'viewer', label: 'Viewer' },
              { value: 'external', label: 'External' },
            ]}
          />
        </Form.Item>
      </div>
      <Form.Item name="temporary" valuePropName="checked" className="create-user-checkbox">
        <Checkbox disabled={Boolean(passwordValue)}>Privremena lozinka + zahtjev promjene</Checkbox>
      </Form.Item>
      <div className="create-user-actions">
        <Button onClick={()=> { form.resetFields(); onCancel(); }}>Odustani</Button>
        <Button type="primary" htmlType="submit" loading={creating}>
          Kreiraj
        </Button>
      </div>
    </Form>
  );
}
