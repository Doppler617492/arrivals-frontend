import React from 'react';

export default function AuthDebug() {
  const [email, setEmail] = React.useState('it@cungu.com');
  const [password, setPassword] = React.useState('');
  const [me, setMe] = React.useState<any>(null);
  const [log, setLog] = React.useState<string>('');
  const cookies = typeof document !== 'undefined' ? document.cookie : '';
  const cookieMode = String(import.meta.env.VITE_AUTH_COOKIES || '0') === '1';

  function append(line: string) { setLog((s)=> s + (s?"\n":"") + line); }

  async function loginCookie() {
    setLog('');
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE || 'http://localhost:8081'}/auth/login-cookie`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }), credentials: 'include'
      });
      append(`${res.status} ${res.statusText}`);
      append(await res.text());
    } catch(e:any) { append(String(e?.message||e)); }
  }
  async function refreshCookie() {
    setLog('');
    try {
      const csrf = getCookie('csrf_refresh_token');
      const res = await fetch(`${import.meta.env.VITE_API_BASE || 'http://localhost:8081'}/auth/refresh-cookie`, {
        method: 'POST', headers: { 'X-CSRF-TOKEN': csrf || '' }, credentials: 'include'
      });
      append(`${res.status} ${res.statusText}`);
      append(await res.text());
    } catch(e:any) { append(String(e?.message||e)); }
  }
  async function logoutCookie() {
    setLog('');
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE || 'http://localhost:8081'}/auth/logout-cookie`, {
        method: 'POST', credentials: 'include'
      });
      append(`${res.status} ${res.statusText}`);
      append(await res.text());
    } catch(e:any) { append(String(e?.message||e)); }
  }
  async function checkMe() {
    setLog('');
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE || 'http://localhost:8081'}/auth/me`, { credentials: 'include' });
      const txt = await res.text();
      append(`${res.status} ${res.statusText}`);
      append(txt);
      try { setMe(JSON.parse(txt)); } catch { setMe(null); }
    } catch(e:any) { append(String(e?.message||e)); }
  }

  function getCookie(name: string): string | undefined {
    try {
      const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()\[\]\\/+^])/g, '\\$1') + '=([^;]*)'));
      return m ? decodeURIComponent(m[1]) : undefined;
    } catch { return undefined; }
  }

  return (
    <div className="um-container" style={{ maxWidth: 760 }}>
      <div className="um-header" style={{ marginBottom: 12 }}>
        <div className="um-title">Auth Debug</div>
      </div>
      <div className="um-section">
        <div className="um-section-title">State</div>
        <div className="text-sm">VITE_AUTH_COOKIES: <b>{cookieMode? '1':'0'}</b></div>
        <div className="text-sm" style={{ wordBreak: 'break-all' }}>csrf_access_token: <b>{getCookie('csrf_access_token')||'(none)'}</b></div>
        <div className="text-sm" style={{ wordBreak: 'break-all' }}>csrf_refresh_token: <b>{getCookie('csrf_refresh_token')||'(none)'}</b></div>
        <div className="text-sm" style={{ wordBreak: 'break-all' }}>document.cookie: <code>{cookies}</code></div>
      </div>
      <div className="um-section">
        <div className="um-section-title">Actions</div>
        <div className="grid gap-2">
          <label className="grid gap-1"><span className="text-xs opacity-70">Email</span>
            <input className="um-input" value={email} onChange={(e)=> setEmail(e.target.value)} />
          </label>
          <label className="grid gap-1"><span className="text-xs opacity-70">Password</span>
            <input className="um-input" type="password" value={password} onChange={(e)=> setPassword(e.target.value)} />
          </label>
          <div className="flex gap-2">
            <button className="um-btn-primary" onClick={loginCookie}>Login (cookie)</button>
            <button className="um-btn" onClick={refreshCookie}>Refresh</button>
            <button className="um-btn" onClick={logoutCookie}>Logout</button>
            <button className="um-btn" onClick={checkMe}>Check /auth/me</button>
          </div>
        </div>
      </div>
      <div className="um-section">
        <div className="um-section-title">Result</div>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, background:'#f8fafc', padding:12, borderRadius:8 }}>{log||'(no output yet)'}</pre>
      </div>
      {me ? (
        <div className="um-section">
          <div className="um-section-title">/auth/me</div>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, background:'#f8fafc', padding:12, borderRadius:8 }}>{JSON.stringify(me, null, 2)}</pre>
        </div>
      ) : null}
    </div>
  );
}

