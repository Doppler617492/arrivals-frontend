import type { Arrival } from '../lib/api';

type Props = { data: Arrival[] };

export default function KpiBar({ data }: Props) {
  const total = data.length;
  const announced = data.filter(a => a.status === 'announced').length;
  const arrived = data.filter(a => a.status === 'arrived').length;
  const delayed = data.filter(a => a.status === 'delayed').length;

  const Card = ({ label, value }: { label: string; value: number }) => (
    <div className="card p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );

  return (
    <div className="grid-cards">
      <Card label="Ukupno" value={total} />
      <Card label="Najavljeno" value={announced} />
      <Card label="Stiglo" value={arrived} />
      <Card label="Kašnjenje" value={delayed} />
    </div>
  );
}