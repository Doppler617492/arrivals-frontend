// src/components/InlineEdit.tsx
import React from "react";
import styles from "../styles";

type Props = {
  value: string;
  textarea?: boolean;
  onSave: (val: string) => void;
};

export default function InlineEdit({ value, onSave, textarea }: Props) {
  const [val, setVal] = React.useState(value);
  const [editing, setEditing] = React.useState(false);

  React.useEffect(() => { setVal(value); }, [value]);

  const commit = () => {
    if (val !== value) onSave(val);
    setEditing(false);
  };

  if (!editing) {
    return <div onDoubleClick={() => setEditing(true)} style={{ cursor: "text" }}>{value || "-"}</div>;
  }

  return textarea ? (
    <div>
      <textarea
        style={styles.textarea}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <button style={styles.primaryBtn} type="button" onClick={commit}>Sačuvaj</button>
        <button style={styles.secondaryBtn} type="button" onClick={() => { setVal(value); setEditing(false); }}>Otkaži</button>
      </div>
    </div>
  ) : (
    <input
      style={styles.input}
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={commit}
      autoFocus
    />
  );
}