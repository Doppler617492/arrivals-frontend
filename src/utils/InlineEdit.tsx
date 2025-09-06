// src/components/InlineEdit.tsx
import React from "react";
type Props = { value: string; textarea?: boolean; onSave: (val: string) => void; inputStyle?: React.CSSProperties; textareaStyle?: React.CSSProperties; btnPrimary?: React.CSSProperties; btnSecondary?: React.CSSProperties; };
export default function InlineEdit({ value, onSave, textarea, inputStyle, textareaStyle, btnPrimary, btnSecondary }: Props){
  const [val, setVal] = React.useState(value);
  const [editing, setEditing] = React.useState(false);
  React.useEffect(()=>{ setVal(value); }, [value]);
  const commit = () => { if(val!==value) onSave(val); setEditing(false); };
  if(!editing) return <div onDoubleClick={()=>setEditing(true)} style={{ cursor:"text" }}>{value || "-"}</div>;
  return textarea ? (
    <div>
      <textarea style={{ padding:"10px 12px", borderRadius:8, border:"1px solid rgba(0,0,0,0.15)", ...textareaStyle }} value={val} onChange={e=>setVal(e.target.value)} onBlur={commit}/>
      <div style={{ display:"flex", gap:8, marginTop:6 }}>
        <button style={{ padding:"8px 12px", borderRadius:8, ...btnPrimary }} type="button" onClick={commit}>Sačuvaj</button>
        <button style={{ padding:"8px 12px", borderRadius:8, ...btnSecondary }} type="button" onClick={()=>{ setVal(value); setEditing(false); }}>Otkaži</button>
      </div>
    </div>
  ) : (
    <input style={{ padding:"10px 12px", borderRadius:8, border:"1px solid rgba(0,0,0,0.15)", ...inputStyle }} value={val} onChange={e=>setVal(e.target.value)} onBlur={commit} autoFocus />
  );
}