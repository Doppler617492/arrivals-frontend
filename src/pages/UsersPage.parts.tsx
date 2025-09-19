import React from 'react';
import { Input, Select, Button, Space, DatePicker } from 'antd';
import { apiGET, apiPOST, apiPATCH, apiUPLOAD } from '../api/client';

// Small subcomponents for the User drawer tabs. Kept minimal on typing to
// avoid TS parser edge-cases in some Vite/Babel setups.

export function ProfileTab(props: any) {
  const { user, onSaved } = props;
  const [form, setForm] = React.useState({
    name: user?.name || '',
    phone: user?.phone || '',
    type: user?.type || 'internal',
    status: user?.status || 'active',
    role: user?.role || 'viewer',
  });
  async function save() {
    await apiPATCH(`/api/users/${user.id}`, form, true);
    onSaved?.();
  }
  return (
    <div className="grid gap-3">
      <label className="grid gap-1"><span className="text-xs opacity-70">Ime i prezime</span><Input value={form.name} onChange={(e)=> setForm({ ...form, name: e.target.value })} /></label>
      <label className="grid gap-1"><span className="text-xs opacity-70">Telefon</span><Input value={form.phone} onChange={(e)=> setForm({ ...form, phone: e.target.value })} /></label>
      <label className="grid gap-1"><span className="text-xs opacity-70">Tip</span><Select value={form.type} onChange={(v)=> setForm({ ...form, type: v })} options={[{value:'internal',label:'Interni'},{value:'external',label:'Eksterni'}]} /></label>
      <label className="grid gap-1"><span className="text-xs opacity-70">Status</span><Select value={form.status} onChange={(v)=> setForm({ ...form, status: v })} options={["active","invited","suspended","locked"].map(s=>({ value:s, label:s }))} /></label>
      <label className="grid gap-1"><span className="text-xs opacity-70">Primarna uloga</span><Select value={form.role} onChange={(v)=> setForm({ ...form, role: v })} options={["admin","manager","magacioner","komercijalista","viewer","external"].map(r=>({ value:r, label:r }))} /></label>
      <div><Button type="primary" onClick={save}>Sačuvaj</Button></div>
    </div>
  );
}

export function RBAC(props: any) {
  const { user } = props;
  const [rolesCSV, setRolesCSV] = React.useState<string>(user?.role || 'viewer');
  const [scope, setScope] = React.useState<string>('');
  async function save() {
    const roles = rolesCSV.split(',').map(s=>s.trim()).filter(Boolean);
    const scopeList = scope.split(',').map(s=>s.trim()).filter(Boolean);
    await apiPOST(`/api/users/${user.id}/roles`, { roles, scope: scopeList }, { auth: true });
  }
  return (
    <div className="grid gap-3">
      <label className="grid gap-1"><span className="text-xs opacity-70">Role keys (comma)</span><Input value={rolesCSV} onChange={e=> setRolesCSV(e.target.value)} /></label>
      <label className="grid gap-1"><span className="text-xs opacity-70">Scope lokacije (npr. PG,NK)</span><Input value={scope} onChange={e=> setScope(e.target.value)} /></label>
      <div><Button type="primary" onClick={save}>Primijeni</Button></div>
      <div className="text-xs opacity-70">Effective permissions: read-only pregledi (TBD)</div>
    </div>
  );
}

export function Activity(props: any) {
  const { user } = props;
  const [rows, setRows] = React.useState<any[]>([]);
  React.useEffect(() => { (async()=>{ try{ const list = await apiGET<any[]>(`/api/users/${user.id}/audit?since=30d`, true); setRows(list||[]);}catch{}})(); }, [user?.id]);
  return (
    <div className="grid gap-2">
      {rows.length===0? <div className="opacity-60 text-sm">Nema aktivnosti.</div> : rows.map((r)=> (
        <div key={r.id} className="border-b border-white/10 py-1"><div className="text-sm">{r.event}</div><div className="text-xs opacity-70">{new Date(r.created_at).toLocaleString()}</div></div>
      ))}
    </div>
  );
}

export function Sessions(props: any) {
  const { user } = props;
  const [rows, setRows] = React.useState<any[]>([]);
  const load = async ()=> { try{ const list = await apiGET<any[]>(`/api/users/${user.id}/sessions`, true); setRows(list||[]);}catch{} };
  React.useEffect(()=>{ load(); }, [user?.id]);
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

export function Productivity(props: any) {
  const { user } = props;
  const [range, setRange] = React.useState<'7d'|'30d'>('7d');
  const [data, setData] = React.useState<any | null>(null);
  const load = async ()=> { try { const d = await apiGET<any>(`/api/users/${user.id}/productivity?range=${range}`, true); setData(d); } catch {} };
  React.useEffect(()=> { load(); }, [user?.id, range]);
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
      <div>
        <div className="text-xs opacity-70 mb-2">Trend (dnevno)</div>
        <div style={{ display:'flex', alignItems:'flex-end', gap:6, height: 120, padding: '6px 4px', border:'1px solid rgba(255,255,255,0.08)', borderRadius: 8 }}>
          {series.map((s:any)=> (
            <div key={s.date} title={`${s.date}: ${s.count}`} style={{ width: 10, background:'#3b82f6', height: Math.max(4, Math.round(110 * s.count / max)) }} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function NotesFiles(props: any) {
  const { user } = props;
  const [notes, setNotes] = React.useState<Array<{id:number;text:string;created_at:string;author_id?:number}>>([]);
  const [files, setFiles] = React.useState<Array<{id:number;label?:string;url:string;created_at:string}>>([]);
  const [text, setText] = React.useState('');
  const load = async ()=> {
    try { const ns = await apiGET<any[]>(`/api/users/${user.id}/notes`, true); setNotes(ns||[]); } catch {}
    try { const fs = await apiGET<any[]>(`/api/users/${user.id}/files`, true); setFiles(fs||[]); } catch {}
  };
  React.useEffect(()=>{ load(); }, [user?.id]);
  async function addNote() {
    if (!text.trim()) return;
    await apiPOST(`/api/users/${user.id}/notes`, { text }, { auth: true });
    setText(''); load();
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

