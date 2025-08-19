type Props = {
  q: string; onQ: (v: string) => void;
  status: string; onStatus: (v: string) => void;
  supplier: string; onSupplier: (v: string) => void;
  onClear: () => void;
};

export default function FiltersBar({ q, onQ, status, onStatus, supplier, onSupplier, onClear }: Props) {
  return (
    <div className="toolbar">
      <div className="flex gap-3 flex-1">
        <div className="flex-1">
          <label className="label">Pretraga (tablica/dobavljač/nosilac)</label>
          <input className="input" placeholder="npr. XYZ-001 ili Podravka"
                 value={q} onChange={e => onQ(e.target.value)} />
        </div>
        <div>
          <label className="label">Status</label>
          <select className="select" value={status} onChange={e => onStatus(e.target.value)}>
            <option value="">Svi</option>
            <option value="announced">Najavljeno</option>
            <option value="arrived">Stiglo</option>
            <option value="delayed">Kasni</option>
          </select>
        </div>
        <div>
          <label className="label">Dobavljač</label>
          <input className="input" placeholder="npr. Podravka"
                 value={supplier} onChange={e => onSupplier(e.target.value)} />
        </div>
      </div>
      <div className="toolbar-actions">
        <button className="btn-outline" onClick={onClear}>Reset</button>
      </div>
    </div>
  );
}