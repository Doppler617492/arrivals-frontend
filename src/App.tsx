// src/App.tsx
import React from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import LoginView from "./features/auth/LoginView";
import RegisterView from "./features/auth/RegisterView";
import ArrivalsCards from "./pages/ArrivalsCards";
import UsersPage from "./pages/UsersPage";
import ContainersPage from "./pages/Containers";
// import SettingsPage from "./pages/Settings";
import { apiGET, apiPOST, getToken, setToken, API_BASE } from "./api/client";
import type { User } from "./types";
import { useAuthStore } from "./store";
import { useNotificationsStore } from "./store/notifications";
import { Layout, Menu, Button, Input, Dropdown, Avatar, Badge, Drawer, Switch, App as AntApp } from 'antd';
import { AppstoreOutlined, UserOutlined, ContainerOutlined, MenuFoldOutlined, MenuUnfoldOutlined, BellOutlined, SearchOutlined, CarOutlined, MoreOutlined, DeleteOutlined, EyeOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useUIStore } from "./store";
import MuseDashboard from "./pages/MuseDashboard";
import AnalyticsArrivals from "./pages/AnalyticsArrivals";
import AnalyticsContainers from "./pages/AnalyticsContainers";
import VozilaPage from "./pages/Vozila";
import AuthDebug from "./pages/AuthDebug";
import SettingsPage from "./pages/Settings";
import NotificationsPage from "./pages/Notifications";
import "./index.css";
import { initRealtime, realtime } from './lib/realtime';

// Classic Shell removed; always enterprise layout

function EnterpriseShell() {
  const { modal } = AntApp.useApp();
  React.useEffect(() => { initRealtime(); }, []);
  const [notifOpen, setNotifOpen] = React.useState(false);
  const notifRef = React.useRef<HTMLDivElement | null>(null);
  const notifs = useNotificationsStore((s)=> s.items);
  const setNotifList = useNotificationsStore((s)=> s.setList);
  const addNotif = useNotificationsStore((s)=> s.add);
  const markReadStore = useNotificationsStore((s)=> s.markRead);
  const markManyStore = useNotificationsStore((s)=> s.markMany);
  const removeNotif = useNotificationsStore((s)=> s.remove);
  const unreadCount = useNotificationsStore((s)=> s.unreadCount);
  const setUnreadCount = useNotificationsStore((s)=> s.setUnreadCount);
  const [notifUnreadOnly, setNotifUnreadOnly] = React.useState<boolean>(false);
  const [notifLimit, setNotifLimit] = React.useState<number>(20);
  // Load unread count on mount
  React.useEffect(() => {
    (async () => {
      const t = getToken();
      if (!t) return;
      try {
        const d = await apiGET<{ count:number }>(`/api/notifications/count?unread=1`, true);
        if (typeof d?.count === 'number') setUnreadCount(d.count);
      } catch {}
    })();
    // Realtime listeners
    const off = realtime.on((evt) => {
      if (evt.type === 'notifications.created' && evt.data) {
        const d: any = evt.data;
        addNotif({ id: Number(d.id), text: String(d.text || ''), read: Boolean(d.read), created_at: d.created_at, navigate_url: d.navigate_url, entity_type: d.entity_type, entity_id: d.entity_id, type: d.type, event: d.event });
      }
      if (evt.type === 'notifications.updated' && evt.data) {
        const d: any = evt.data;
        markReadStore(Number(d.id), Boolean(d.read));
      }
      if (evt.type === 'notifications.deleted' && evt.id) {
        removeNotif(Number(evt.id));
      }
      if (evt.type === 'notifications.bulk') {
        const data: any = evt;
        if (data.action === 'ack' && Array.isArray(data.ids)) {
          markManyStore(data.ids.map((id: number|string) => Number(id)), true);
        }
        if (data.action === 'deleted' && Array.isArray(data.ids)) {
          data.ids.forEach((id: number|string) => removeNotif(Number(id)));
        }
      }
      if (evt.type === 'focus-arrival' && evt.id) {
        // Navigate to arrivals and focus by hash
        window.location.href = `/arrivals#${evt.id}`;
      }
      if (evt.type === 'ui.focus' && evt.resource === 'arrival' && evt.id) {
        window.location.href = `/arrivals#${evt.id}`;
      }
    });
    return () => { try { off?.(); } catch {} };
  }, [addNotif, markManyStore, markReadStore, removeNotif, setUnreadCount]);

  // Close legacy dropdown on outside click and ESC (ignore Drawer clicks)
  React.useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!notifOpen) return;
      // If click is inside AntD Drawer, do not close
      const target = e.target as HTMLElement | null;
      if (target && target.closest && target.closest('.ant-drawer')) return;
      const el = notifRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) setNotifOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (!notifOpen) return;
      if (e.key === 'Escape') setNotifOpen(false);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [notifOpen]);

  async function toggleNotif() {
    const next = !notifOpen; setNotifOpen(next);
    if (next && notifs.length === 0) {
      try {
        const qs = new URLSearchParams();
        if (notifUnreadOnly) qs.set('unread', '1');
        if (notifLimit) qs.set('limit', String(notifLimit));
        const list = await apiGET<any[]>(`/api/notifications${qs.toString()?`?${qs.toString()}`:''}`, true);
        setNotifList((list || []).map((n:any) => ({ id: Number(n.id), text: String(n.text || ''), read: Boolean(n.read), created_at: n.created_at, navigate_url: n.navigate_url, entity_type: n.entity_type, entity_id: n.entity_id, type: n.type, event: n.event })));
      } catch {}
    }
  }

  async function openNotification(n: { id:number; navigate_url?: string; entity_type?: string; entity_id?: number }) {
    try { await apiPOST(`/api/notifications/${n.id}/open`, {}, { auth: true }); } catch {}
    markReadStore(n.id, true);
    if (n.navigate_url) window.location.href = n.navigate_url;
    else if (n.entity_type === 'arrival' && n.entity_id) window.location.href = `/arrivals#${n.entity_id}`;
  }

  function fmtTime(s?: string) {
    if (!s) return '';
    try { return new Date(s).toLocaleString('sr-RS', { timeZone: 'Europe/Podgorica' }); } catch { return s; }
  }
  const sidebarOpen = useUIStore(s => s.sidebarOpen);
  const toggleSidebar = useUIStore(s => s.toggleSidebar);
  const themeColor = useUIStore(s => s.themeColor);
  const headerFixed = useUIStore(s => s.headerFixed);
  const headerTransparent = useUIStore(s => s.headerTransparent);
  const navigate = useNavigate();
  const location = useLocation();
  const siderColors: Record<string, string> = {
    blue: '#3f5ae0',
    green: '#34c759',
    red: '#ff4d4f',
    yellow: '#fadb14',
    black: '#111827',
  };
  const siderBg = siderColors[themeColor] || '#3f5ae0';
  const headerBg = headerTransparent ? 'rgba(255,255,255,0.7)' : '#fff';
  const headerStyle: React.CSSProperties = {
    backdropFilter: headerTransparent ? 'saturate(150%) blur(6px)' : undefined,
    WebkitBackdropFilter: headerTransparent ? 'saturate(150%) blur(6px)' : undefined,
    position: headerFixed ? 'sticky' as const : 'relative',
    top: 0,
    zIndex: 10,
  };
  const setUserStore = useAuthStore(s => s.setUser);
  const userMenuItems = [
    { key: 'profile', label: 'Profil' },
    { key: 'logout', danger: true, label: 'Odjava', onClick: ()=> { setToken(null); try { setUserStore(null as any); } catch {} window.location.href = '/login'; } },
  ];
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Sider className="um-sider" collapsible collapsed={!sidebarOpen} trigger={null} width={250} style={{ background: siderBg }}>
        <div className="um-sider-header" style={{ height: 56, display:'flex', alignItems:'center', justifyContent: sidebarOpen? 'space-between':'center', padding: '0 12px', color:'#fff', fontWeight:700, letterSpacing:.5 }}>
          {!sidebarOpen ? <img src="/logo.svg" alt="Arrivals" style={{ width: 24, height: 24 }} onError={(e)=>{(e.currentTarget as HTMLImageElement).src='/logo-cungu.png';}}/> : <span>Arrivals</span>}
          {sidebarOpen && <Button size="small" type="text" className="um-sider-toggle" style={{ color:'#E0E0E0' }} onClick={toggleSidebar} icon={sidebarOpen ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />} />}
        </div>
        <Menu className="um-sider-menu" theme="dark" mode="inline" selectedKeys={[location.pathname]} onClick={({ key }) => navigate(String(key))} items={[
          { key: '/dashboard', icon: <AppstoreOutlined />, label: 'Dashboard' },
          { key: '/arrivals', icon: <AppstoreOutlined />, label: 'Dolazci' },
          { key: '/containers', icon: <ContainerOutlined />, label: 'Kontejneri' },
          { key: '/analytics/arrivals', icon: <AppstoreOutlined />, label: 'Analitika (Dolazci)' },
          { key: '/analytics/containers', icon: <ContainerOutlined />, label: 'Analitika (Kontejneri)' },
          { key: '/users', icon: <UserOutlined />, label: 'Korisnici' },
          { key: '/vozila', icon: <CarOutlined />, label: 'Vozila' },
          { key: '/notifications', icon: <BellOutlined />, label: 'Notifikacije' },
        ]} />
      </Layout.Sider>
      <Layout>
        <Layout.Header style={{ background: headerBg, borderBottom: '1px solid #f0f1f5', display:'flex', alignItems:'center', gap: 8, ...headerStyle }}>
          <Button type="text" onClick={toggleSidebar} icon={sidebarOpen ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />} />
          <div style={{ fontWeight: 600 }}>Arrivals</div>
          <div style={{ marginLeft: 'auto' }} />
          <Input prefix={<SearchOutlined />} placeholder="Pretraga" allowClear style={{ width: 280 }} />
          <div style={{ position:'relative' }} ref={notifRef}>
            <Badge count={unreadCount} size="small" style={{ backgroundColor:'#ef4444' }}>
              <Button type="text" icon={<BellOutlined />} onClick={toggleNotif} />
            </Badge>
          </div>
          <Drawer
            title="Obavijesti"
            placement="right"
            width={400}
            open={notifOpen}
            onClose={()=> setNotifOpen(false)}
            destroyOnClose
            styles={{ header: { padding: '10px 14px' }, body: { padding: 0 } }}
            extra={
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:12, color:'#64748b' }}>Prikaži</span>
                <select value={notifLimit} onChange={async (e)=>{ const v = Number(e.target.value)||20; setNotifLimit(v); try { const qs = new URLSearchParams(); qs.set('limit', String(v)); const list = await apiGET<any[]>(`/api/notifications?${qs.toString()}`, true); setNotifList((list || []).map((n:any) => ({ id: Number(n.id), text: String(n.text || ''), read: Boolean(n.read), created_at: n.created_at, navigate_url: n.navigate_url, entity_type: n.entity_type, entity_id: n.entity_id, type: n.type, event: n.event }))); } catch {} }} style={{ fontSize:12 }}>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </div>
            }
          >
            {/* Filters & global actions (sticky) */}
            <div style={{ position:'sticky', top:0, zIndex:1, background:'#fff', borderBottom:'1px solid #EAEAEA', padding:'10px 12px' }}>
              <div className="notif-inline" onClick={(e)=> e.stopPropagation()}>
                <Switch className="notif-switch" size="small" checkedChildren="On" unCheckedChildren="Off" checked={notifUnreadOnly} onChange={async (checked: boolean) => {
                  setNotifUnreadOnly(checked);
                  try {
                    const qs = new URLSearchParams();
                    if (checked) qs.set('unread','1');
                    if (notifLimit) qs.set('limit', String(notifLimit));
                    const list = await apiGET<any[]>(`/api/notifications${qs.toString()?`?${qs.toString()}`:''}`, true);
                    setNotifList((list || []).map((n:any) => ({ id: Number(n.id), text: String(n.text || ''), read: Boolean(n.read), created_at: n.created_at, navigate_url: n.navigate_url, entity_type: n.entity_type, entity_id: n.entity_id, type: n.type, event: n.event })));
                  } catch {}
                }} />
                <span>Samo nepročitane</span>
                <span className="notif-count">{(notifs || []).filter(n => !n.read).length}</span>
              </div>
            </div>
            {/* List */}
            <div style={{ maxHeight: 'calc(100vh - 180px)', overflow:'auto', background:'#fff' }} className="notif-list">
              {(!notifs || notifs.length === 0) ? (
                <div style={{ padding:20, color:'#64748b', textAlign:'center' }}>
                  <div style={{ fontSize:28, marginBottom:6 }}>📭</div>
                  <div>Nema novih obavijesti</div>
                </div>
              ) : notifs.map((n) => {
                const menuItems = [
                  { key: 'open', label: 'Detalji', icon: <EyeOutlined /> },
                  { key: 'mark', label: n.read? 'Označi kao nepročitano':'Označi kao pročitano', icon: <CheckCircleOutlined /> },
                  { type: 'divider' as const },
                  { key: 'delete', label: 'Izbriši', icon: <DeleteOutlined />, danger: true as any },
                ];
                return (
                  <div key={n.id}
                    className="notif-item"
                    style={{ position:'relative', padding:'16px 24px', borderBottom:'1px solid #F5F5F5', cursor:'pointer', background: n.read ? '#fff' : '#F0F2F5' }}
                    onMouseEnter={(e)=> (e.currentTarget.style.background = n.read? '#EAEAEA' : '#EAEAEA')}
                    onMouseLeave={(e)=> (e.currentTarget.style.background = n.read? '#fff' : '#F0F2F5')}
                    onClick={()=> openNotification(n)}
                  >
                    <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                      <span style={{ width:8, height:8, borderRadius:999, background: n.read? 'transparent':'#5A67D8', marginTop:7 }} />
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:16, fontWeight: n.read? 500:700, color: n.read? '#555' : '#333', lineHeight:1.4 }}>{n.text}</div>
                        <div style={{ fontSize:13, color:'#999', marginTop:4 }}>{fmtTime(n.created_at)}</div>
                      </div>
                      <Dropdown
                        menu={{ items: menuItems, onClick: async ({ key }) => {
                          if (key==='open') { if (n.navigate_url) window.location.href = n.navigate_url; else openNotification(n); return; }
                          if (key==='mark') {
                            try { await apiPOST(`/api/notifications/ack`, { ids:[n.id], read: !n.read }, { auth: true }); } catch {}
                            markReadStore(n.id, !n.read);
                            return;
                          }
                          if (key==='delete') {
                            try { await fetch(`${API_BASE}/api/notifications/${n.id}`, { method:'DELETE', headers:{ 'Accept':'application/json', 'Authorization': `Bearer ${getToken() || ''}` }, credentials:'include' as RequestCredentials }); } catch {}
                            removeNotif(n.id);
                            return;
                          }
                        } }}
                        trigger={["click"]}
                      >
                        <Button type="text" size="small" icon={<MoreOutlined />} onClick={(e)=> e.stopPropagation()} />
                      </Dropdown>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Footer */}
            <div style={{ padding: '10px 12px', display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, background:'#fafafa', borderTop:'1px solid #f1f5f9' }}>
              <div style={{ display:'flex', gap:10 }}>
                <Button
                  danger
                  type="primary"
                  size="small"
                  style={{ backgroundColor: '#dc2626', borderColor: '#dc2626', color: '#fff' }}
                  onClick={()=>{
                    modal.confirm({
                      title: 'Izbriši sve obavijesti?',
                      content: 'Ova radnja je nepovratna.',
                      okText: 'Izbriši sve',
                      okType: 'danger',
                      okButtonProps: { danger: true, type: 'primary', style: { backgroundColor: '#dc2626', borderColor: '#dc2626' } },
                      cancelText: 'Odustani',
                      onOk: async ()=> {
                        try { await apiPOST(`/api/notifications/bulk_delete`, { unread: notifUnreadOnly }, { auth: true }); } catch {}
                        try {
                          const qs = new URLSearchParams();
                          if (notifUnreadOnly) qs.set('unread','1');
                          if (notifLimit) qs.set('limit', String(notifLimit));
                          const list = await apiGET<any[]>(`/api/notifications${qs.toString()?`?${qs.toString()}`:''}`, true);
                          setNotifList((list || []).map((n:any) => ({ id: Number(n.id), text: String(n.text || ''), read: Boolean(n.read), created_at: n.created_at, navigate_url: n.navigate_url, entity_type: n.entity_type, entity_id: n.entity_id, type: n.type, event: n.event })));
                        } catch {}
                        markManyStore([], true);
                        setUnreadCount(0);
                      }
                    });
                  }}
                >
                  Izbriši sve
                </Button>
              </div>
              <div style={{ display:'flex', gap:10 }}>
                <Button size="small" onClick={()=> { setNotifOpen(false); navigate('/notifications'); }}>Prikaži sve</Button>
              </div>
            </div>
          </Drawer>
          <Dropdown menu={{ items: userMenuItems }} trigger={["click"]}>
            <Avatar style={{ background:'#3f5ae0', cursor:'pointer' }} size="small">A</Avatar>
          </Dropdown>
        </Layout.Header>
        <Layout.Content style={{ padding: 16 }}>
          <Routes>
            <Route path="/dashboard" element={<MuseDashboard />} />
            <Route path="/arrivals" element={<ArrivalsCards />} />
            <Route path="/containers" element={<ContainersPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/vozila" element={<VozilaPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/admin/auth-debug" element={<AuthDebug />} />
            <Route path="/analytics/arrivals" element={<AnalyticsArrivals />} />
            <Route path="/analytics/containers" element={<AnalyticsContainers />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Layout.Content>
      </Layout>
    </Layout>
  );
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [loadingMe, setLoadingMe] = React.useState(true);

  React.useEffect(() => {
    const t = getToken();
    if (!t) { try { setUser(null as any); } catch {} setLoadingMe(false); return; }
    (async () => {
      try {
        const me = await apiGET<{ user: User }>("/auth/me", true);
        setUser(me.user);
      } catch {
        setToken(null);
        try { setUser(null as any); } catch {}
      } finally { setLoadingMe(false); }
    })();
  }, []);

  if (loadingMe) {
    return (
      <div className="min-h-screen grid place-items-center bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
        <div className="animate-pulse text-sm opacity-70">Učitavanje…</div>
      </div>
    );
  }

  if (!user) {
    // Neprijavljen korisnik: dozvoli /login i /register bez Header/Sidebar-a
    return (
      <Routes>
        <Route
          path="/login"
          element={
            <div className="min-h-screen grid place-items-center bg-[#f1f5f9]">
              <LoginView onLoggedIn={setUser} />
            </div>
          }
        />
        <Route
          path="/register"
          element={
            <div className="min-h-screen grid place-items-center bg-[#f1f5f9]">
              <RegisterView onSubmitted={() => navigate("/login?requested=1")} />
            </div>
          }
        />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  // Ako je korisnik prijavljen a ruta je /login ili /register, prebaci na /dashboard
  if (location.pathname === "/login" || location.pathname === "/register") {
    return <Navigate to="/dashboard" replace />;
  }
  // Always enterprise shell
  return <EnterpriseShell />;
}
