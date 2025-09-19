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
import { Layout, Menu, Button, Input, Dropdown, Avatar, Badge, Drawer, Radio, Switch, Space } from 'antd';
import { AppstoreOutlined, UserOutlined, ContainerOutlined, SettingOutlined, MenuFoldOutlined, MenuUnfoldOutlined, BellOutlined, SearchOutlined, BulbOutlined } from '@ant-design/icons';
import { useUIStore } from "./store";
import MuseDashboard from "./pages/MuseDashboard";
import AnalyticsArrivals from "./pages/AnalyticsArrivals";
import AnalyticsContainers from "./pages/AnalyticsContainers";
import SettingsPage from "./pages/Settings";
import "./index.css";
import { initRealtime, realtime } from './lib/realtime';

// Classic Shell removed; always enterprise layout

function EnterpriseShell() {
  React.useEffect(() => { initRealtime(); }, []);
  const [notifOpen, setNotifOpen] = React.useState(false);
  const notifRef = React.useRef<HTMLDivElement | null>(null);
  const [notifs, setNotifs] = React.useState<Array<{ id:number; text:string; read?:boolean; created_at?: string; navigate_url?: string; entity_type?: string; entity_id?: number }>>([]);
  const [unreadCount, setUnreadCount] = React.useState<number>(0);
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
        setUnreadCount((c) => c + 1);
        setNotifs((prev) => [{ id: Number(d.id), text: String(d.text || ''), read: false, created_at: d.created_at, navigate_url: d.navigate_url, entity_type: d.entity_type, entity_id: d.entity_id }, ...prev].slice(0, 20));
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
  }, []);

  // Close dropdown on outside click and ESC
  React.useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!notifOpen) return;
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
        setNotifs((list || []).map((n:any) => ({ id: Number(n.id), text: String(n.text || ''), read: Boolean(n.read), created_at: n.created_at, navigate_url: n.navigate_url, entity_type: n.entity_type, entity_id: n.entity_id })));
      } catch {}
    }
  }

  async function openNotification(n: { id:number; navigate_url?: string; entity_type?: string; entity_id?: number }) {
    try { await apiPOST(`/api/notifications/${n.id}/open`, {}, { auth: true }); } catch {}
    setNotifs(prev => prev.map(it => it.id === n.id ? { ...it, read: true } : it));
    setUnreadCount(c => Math.max(0, c - 1));
    if (n.navigate_url) window.location.href = n.navigate_url;
    else if (n.entity_type === 'arrival' && n.entity_id) window.location.href = `/arrivals#${n.entity_id}`;
  }

  async function markAllAsRead() {
    const ids = notifs.filter(n => !n.read).map(n => n.id);
    if (!ids.length) { setNotifOpen(false); return; }
    try { await apiPOST(`/api/notifications/ack`, { ids, read: true }, { auth: true }); } catch {}
    setNotifs(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
    setNotifOpen(false);
  }

  async function deleteNotification(e: React.MouseEvent, n: { id:number; read?: boolean }) {
    e.stopPropagation();
    try { await fetch(`${API_BASE}/api/notifications/${n.id}`, { method: 'DELETE', headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${getToken() || ''}` }, credentials: 'include' as RequestCredentials }); } catch {}
    setNotifs(prev => prev.filter(it => it.id !== n.id));
    if (!n.read) setUnreadCount(c => Math.max(0, c - 1));
  }

  function fmtTime(s?: string) {
    if (!s) return '';
    try { return new Date(s).toLocaleString(); } catch { return s; }
  }
  const sidebarOpen = useUIStore(s => s.sidebarOpen);
  const toggleSidebar = useUIStore(s => s.toggleSidebar);
  const themeColor = useUIStore(s => s.themeColor);
  const headerFixed = useUIStore(s => s.headerFixed);
  const headerTransparent = useUIStore(s => s.headerTransparent);
  const darkMode = useUIStore(s => s.darkMode);
  const setDarkMode = useUIStore(s => s.setDarkMode);
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
  const setThemeColor = useUIStore(s => s.setThemeColor);
  const setHeaderFixed = useUIStore(s => s.setHeaderFixed);
  const setHeaderTransparent = useUIStore(s => s.setHeaderTransparent);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Sider collapsible collapsed={!sidebarOpen} trigger={null} width={250} style={{ background: siderBg }}>
        <div style={{ height: 56, display:'flex', alignItems:'center', justifyContent: sidebarOpen? 'space-between':'center', padding: '0 12px', color:'#fff', fontWeight:600 }}>
          {!sidebarOpen ? <img src="/logo.svg" alt="Arrivals" style={{ width: 24, height: 24 }} onError={(e)=>{(e.currentTarget as HTMLImageElement).src='/logo-cungu.png';}}/> : <span>Arrivals</span>}
          {sidebarOpen && <Button size="small" type="text" style={{ color:'#fff' }} onClick={toggleSidebar} icon={sidebarOpen ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />} />}
        </div>
        <Menu theme="dark" mode="inline" selectedKeys={[location.pathname]} onClick={({ key }) => navigate(String(key))} items={[
          { key: '/dashboard', icon: <AppstoreOutlined />, label: 'Dashboard' },
          { key: '/arrivals', icon: <AppstoreOutlined />, label: 'Dolazci' },
          { key: '/containers', icon: <ContainerOutlined />, label: 'Kontejneri' },
          { key: '/analytics/arrivals', icon: <AppstoreOutlined />, label: 'Analitika (Dolazci)' },
          { key: '/analytics/containers', icon: <ContainerOutlined />, label: 'Analitika (Kontejneri)' },
          { key: '/users', icon: <UserOutlined />, label: 'Korisnici' },
          { key: '/settings', icon: <SettingOutlined />, label: 'Postavke' },
        ]} />
      </Layout.Sider>
      <Layout>
        <Layout.Header style={{ background: headerBg, borderBottom: '1px solid #f0f1f5', display:'flex', alignItems:'center', gap: 8, ...headerStyle }}>
          <Button type="text" onClick={toggleSidebar} icon={sidebarOpen ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />} />
          <div style={{ fontWeight: 600 }}>Arrivals</div>
          <div style={{ marginLeft: 'auto' }} />
          <Input prefix={<SearchOutlined />} placeholder="Pretraga" allowClear style={{ width: 280 }} />
          <Space>
            <span style={{opacity:.6,fontSize:12}}>Tema</span>
            <Switch size="small" checkedChildren={<BulbOutlined />} unCheckedChildren={<BulbOutlined />} checked={darkMode} onChange={setDarkMode} />
          </Space>
          <div style={{ position:'relative' }} ref={notifRef}>
            <Badge count={unreadCount} size="small">
              <Button type="text" icon={<BellOutlined />} onClick={toggleNotif} />
            </Badge>
            {notifOpen && (
              <div style={{ position:'absolute', right:0, top:36, width: 360, background:'#fff', border:'1px solid #f0f0f0', borderRadius:8, boxShadow:'0 6px 24px rgba(0,0,0,0.08)', overflow:'hidden', zIndex: 1000 }}>
              <div style={{ fontWeight:700, padding:'10px 12px', borderBottom:'1px solid #f2f4f8' }}>Obavijesti</div>
                <div style={{ padding:'6px 12px', display:'flex', gap:8, alignItems:'center' }}>
                  <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12 }}>
                    <input type="checkbox" checked={notifUnreadOnly} onChange={async (e)=>{ setNotifUnreadOnly(e.target.checked); try { const qs = new URLSearchParams(); if (e.target.checked) qs.set('unread','1'); if (notifLimit) qs.set('limit', String(notifLimit)); const list = await apiGET<any[]>(`/api/notifications${qs.toString()?`?${qs.toString()}`:''}`, true); setNotifs((list || []).map((n:any) => ({ id: Number(n.id), text: String(n.text || ''), read: Boolean(n.read), created_at: n.created_at, navigate_url: n.navigate_url, entity_type: n.entity_type, entity_id: n.entity_id }))); } catch {} }} />
                    Samo nepročitane
                  </label>
                  <select value={notifLimit} onChange={async (e)=>{ const v = Number(e.target.value)||20; setNotifLimit(v); try { const qs = new URLSearchParams(); if (notifUnreadOnly) qs.set('unread','1'); qs.set('limit', String(v)); const list = await apiGET<any[]>(`/api/notifications?${qs.toString()}`, true); setNotifs((list || []).map((n:any) => ({ id: Number(n.id), text: String(n.text || ''), read: Boolean(n.read), created_at: n.created_at, navigate_url: n.navigate_url, entity_type: n.entity_type, entity_id: n.entity_id }))); } catch {} }} style={{ fontSize:12 }}>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                </div>
                <div style={{ maxHeight: 280, overflow:'auto' }}>
                  {(!notifs || notifs.length === 0) ? (
                    <div style={{ padding:12, color:'#64748b' }}>Nema obavještenja.</div>
                  ) : notifs.map((n) => (
                    <div key={n.id} onClick={()=> openNotification(n)} style={{ padding:'10px 12px', borderBottom:'1px solid #f2f4f8', cursor:'pointer', background: n.read ? '#fff' : '#f8fafc' }}>
                      <div style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: n.read ? 500 : 700, lineHeight: 1.2 }}>{n.text}</div>
                        </div>
                        <div style={{ fontSize:12, color:'#94a3b8', whiteSpace:'nowrap' }}>{fmtTime(n.created_at)}</div>
                      </div>
                      <div style={{ marginTop:4, display:'flex', justifyContent:'flex-end' }}>
                        <a onClick={(e)=> deleteNotification(e, n)} style={{ color:'#ff4d4f', fontSize:12 }}>Obriši</a>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ padding: '8px 12px', display:'flex', justifyContent:'space-between', gap:8 }}>
                  <div style={{ display:'flex', gap:8 }}>
                    <Button size="small" onClick={markAllAsRead}>Mark all as read</Button>
                    <Button size="small" onClick={async()=>{ try { await apiPOST(`/api/notifications/bulk_delete`, { all: true }, { auth: true }); } catch {} try { localStorage.removeItem('arrivals_notifications'); } catch {} setNotifs([]); setUnreadCount(0); setNotifOpen(false); }}>Clear all</Button>
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    <Button size="small" onClick={async()=>{ const ids = notifs.map(n=>n.id); if (!ids.length) { setNotifOpen(false); return; } try { await apiPOST(`/api/notifications/ack`, { ids, read: false }, { auth: true }); } catch {} setNotifs(prev=> prev.map(n=> ({ ...n, read: false }))); setUnreadCount(notifs.length); setNotifOpen(false); }}>Mark all as unread</Button>
                    <Button size="small" onClick={()=> setNotifOpen(false)}>Zatvori</Button>
                  </div>
                </div>
              </div>
            )}
          </div>
          <Button type="text" icon={<SettingOutlined />} onClick={()=> setDrawerOpen(true)} />
          <Dropdown menu={{ items: userMenuItems }} trigger={["click"]}>
            <Avatar style={{ background:'#3f5ae0', cursor:'pointer' }} size="small">A</Avatar>
          </Dropdown>
        </Layout.Header>
        <Layout.Content style={{ padding: 16 }}>
          <Routes>
            <Route path="/dashboard" element={<MuseDashboard />} />
            <Route path="/arrivals" element={<ArrivalsCards />} />
            <Route path="/containers" element={<ContainersPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/analytics/arrivals" element={<AnalyticsArrivals />} />
            <Route path="/analytics/containers" element={<AnalyticsContainers />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Layout.Content>
        <Drawer
          title="Appearance"
          placement="right"
          width={300}
          open={drawerOpen}
          onClose={()=> setDrawerOpen(false)}
        >
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Theme color</div>
              <Radio.Group value={themeColor} onChange={(e)=> setThemeColor(e.target.value)}>
                <Space direction="vertical">
                  <Radio value="blue">Blue</Radio>
                  <Radio value="green">Green</Radio>
                  <Radio value="red">Red</Radio>
                  <Radio value="yellow">Yellow</Radio>
                  <Radio value="black">Black</Radio>
                </Space>
              </Radio.Group>
            </div>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Header</div>
              <Space direction="vertical">
                <div><Switch checked={headerFixed} onChange={setHeaderFixed} /> <span style={{ marginLeft: 8 }}>Fixed</span></div>
                <div><Switch checked={headerTransparent} onChange={setHeaderTransparent} /> <span style={{ marginLeft: 8 }}>Transparent</span></div>
              </Space>
            </div>
          </Space>
        </Drawer>
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
