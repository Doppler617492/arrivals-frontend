import React from 'react';
import { Card, Table, Space, Button, Tag, Input, Select, DatePicker, Modal, Form, message, Popconfirm } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { apiGET, apiPOST, apiPATCH, apiDELETE } from '../api/client';

type Arrival = {
  id: number;
  supplier?: string;
  carrier?: string;
  plate?: string;
  type?: string;
  driver?: string;
  pickup_date?: string; // ISO
  eta?: string; // ISO
  transport_price?: number;
  goods_price?: number;
  status?: 'not_shipped' | 'shipped' | 'arrived' | string;
  location?: string;
  transport_type?: string;
  note?: string;
};

function normalizeStatus(s: any): 'not_shipped' | 'shipped' | 'arrived' {
  const v = String(s || '').toLowerCase().replace(/\s+/g, '_');
  if (['announced','not_shipped','not-shipped','notshipped','najavljeno'].includes(v)) return 'not_shipped';
  if (['shipped','in_transit','in-transit','intransit','u_transportu'].includes(v)) return 'shipped';
  return 'arrived';
}

const statusLabel: Record<'not_shipped'|'shipped'|'arrived', string> = {
  not_shipped: 'Najavljeno',
  shipped: 'U transportu',
  arrived: 'Stiglo',
};

export default function ArrivalsAntD() {
  const [rows, setRows] = React.useState<Arrival[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [q, setQ] = React.useState('');
  const [status, setStatus] = React.useState<string>('');
  const [dateFrom, setDateFrom] = React.useState<string>('');
  const [dateTo, setDateTo] = React.useState<string>('');
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Arrival | null>(null);
  const [form] = Form.useForm<Arrival>();

  async function refresh() {
    setLoading(true);
    try {
      const data = await apiGET<any[]>('/api/arrivals', true).catch(()=> []);
      const list = Array.isArray(data) ? data : [];
      const mapped: Arrival[] = list.map((a: any) => ({
        ...a,
        id: Number(a.id),
        status: normalizeStatus(a.status),
      }));
      setRows(mapped);
    } catch (e: any) {
      message.error(e?.message || 'Greška pri učitavanju.');
    } finally { setLoading(false); }
  }
  React.useEffect(() => { refresh(); }, []);

  // Debounce search input sync
  const [searchValue, setSearchValue] = React.useState('');
  React.useEffect(() => {
    const t = setTimeout(() => setQ(searchValue), 400);
    return () => clearTimeout(t);
  }, [searchValue]);

  const filtered = React.useMemo(() => {
    const qq = q.trim().toLowerCase();
    const inRange = (iso?: string) => {
      if (!iso) return true;
      const d = iso.slice(0,10);
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    };
    return rows.filter(r => {
      if (status && normalizeStatus(r.status) !== status) return false as any;
      if (!inRange(r.eta)) return false as any;
      if (!qq) return true;
      const hay = [r.id, r.supplier, r.carrier, r.plate, r.driver, r.location].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(qq);
    });
  }, [rows, q, status, dateFrom, dateTo]);

  const columns: ColumnsType<Arrival> = [
    { title: '#', dataIndex: 'id', width: 72 },
    { title: 'Dobavljač', dataIndex: 'supplier' },
    { title: 'Status', dataIndex: 'status', width: 140, render: (v) => {
      const s = normalizeStatus(v);
      const color = s==='arrived' ? 'green' : s==='shipped' ? 'blue' : 'default';
      return <Tag color={color}>{statusLabel[s]}</Tag>;
    }},
    { title: 'ETA', dataIndex: 'eta', width: 140, render: (v) => v ? new Date(v).toLocaleDateString() : '-' },
    { title: 'Lokacija', dataIndex: 'location' },
    { title: 'Prevoznik', dataIndex: 'carrier' },
    { title: 'Tablice', dataIndex: 'plate' },
    { title: 'Vozač', dataIndex: 'driver' },
    { title: 'Akcije', key: 'actions', width: 180, render: (_, r) => (
      <Space>
        <Button type="link" onClick={() => onEdit(r)}>Uredi</Button>
        <Popconfirm title="Obriši?" onConfirm={() => onDelete(r)}>
          <Button type="link" danger>Obriši</Button>
        </Popconfirm>
      </Space>
    )},
  ];

  function onAdd() {
    setEditing(null);
    form.resetFields();
    setOpen(true);
  }
  function onEdit(r: Arrival) {
    setEditing(r);
    form.setFieldsValue({ ...r });
    setOpen(true);
  }
  async function onDelete(r: Arrival) {
    try {
      await apiDELETE(`/api/arrivals/${r.id}`, true);
      message.success('Obrisano');
      refresh();
    } catch (e: any) { message.error(e?.message || 'Brisanje nije uspjelo'); }
  }

  async function onSubmit() {
    try {
      const v = await form.validateFields();
      if (editing) {
        await apiPATCH(`/api/arrivals/${editing.id}`, v, true);
        message.success('Sačuvano');
      } else {
        await apiPOST('/api/arrivals', v, { auth: true });
        message.success('Kreirano');
      }
      setOpen(false);
      refresh();
    } catch {}
  }

  return (
    <Card title="Dolasci" extra={<Button type="primary" onClick={onAdd}>+ Add New Arrival</Button>}>
      <Space wrap style={{ marginBottom: 12 }}>
        <Input.Search placeholder="Pretraga…" allowClear value={searchValue} onChange={(e)=> setSearchValue(e.target.value)} style={{ width: 260 }} />
        <Select value={status} onChange={setStatus} placeholder="Status" style={{ width: 160 }} allowClear options={[
          { value: 'not_shipped', label: 'Najavljeno' },{ value: 'shipped', label: 'U transportu' },{ value: 'arrived', label: 'Stiglo' }
        ]} />
        <DatePicker placeholder="Od" value={dateFrom? (window as any).dayjs?.(dateFrom) : null} onChange={(d)=> setDateFrom(d? d.format('YYYY-MM-DD') : '')} />
        <DatePicker placeholder="Do" value={dateTo? (window as any).dayjs?.(dateTo) : null} onChange={(d)=> setDateTo(d? d.format('YYYY-MM-DD') : '')} />
      </Space>
      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={filtered}
        pagination={{ pageSize: 20, showSizeChanger: true }}
      />

      <Modal open={open} onCancel={()=> setOpen(false)} onOk={onSubmit} title={editing? `Uredi #${editing.id}` : 'Novi dolazak'}>
        <Form form={form} layout="vertical">
          <Form.Item name="supplier" label="Dobavljač" rules={[{ required: true, message: 'Obavezno' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="status" label="Status" initialValue="not_shipped" rules={[{ required: true }]}>
            <Select options={[{ value: 'not_shipped', label: 'Najavljeno' },{ value: 'shipped', label: 'U transportu' },{ value: 'arrived', label: 'Stiglo' }]} />
          </Form.Item>
          <Form.Item name="eta" label="ETA">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="location" label="Lokacija">
            <Input />
          </Form.Item>
          <Form.Item name="carrier" label="Prevoznik">
            <Input />
          </Form.Item>
          <Form.Item name="plate" label="Tablice">
            <Input />
          </Form.Item>
          <Form.Item name="driver" label="Vozač">
            <Input />
          </Form.Item>
          <Form.Item name="note" label="Napomena">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}

