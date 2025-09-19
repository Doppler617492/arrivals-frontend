import React from 'react';
import { Table, Space, Input, Select, DatePicker, Switch, message, Card, Form, InputNumber } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { api } from '../lib/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';

type Row = {
  id: number;
  supplier?: string;
  proforma_no?: string;
  etd?: string;
  delivery?: string;
  eta?: string;
  cargo_qty?: number;
  cargo?: string;
  container_no?: string;
  roba?: string;
  contain_price?: number;
  agent?: string;
  total?: number;
  deposit?: number;
  balance?: number;
  paid?: boolean;
};

export default function ContainersGridAntd() {
  const [rows, setRows] = React.useState<Row[]>([]);
  const [q, setQ] = React.useState('');
  const [status, setStatus] = React.useState<string>('');
  const [dateField, setDateField] = React.useState<'eta'|'etd'>('eta');
  const [from, setFrom] = React.useState<string>('');
  const [to, setTo] = React.useState<string>('');
  const [supplierF, setSupplierF] = React.useState<string>('');
  const [agentF, setAgentF] = React.useState<string>('');
  const [form] = Form.useForm<Row>();
  const [editingKey, setEditingKey] = React.useState<number | null>(null);

  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['containers', { q, status, dateField, from, to }],
    queryFn: async () => {
      const list = await api.fetchContainers({ q, status: status as any, dateField, from, to, sortBy: 'created_at', sortDir: 'desc' });
      return Array.isArray(list) ? (list as Row[]) : [];
    },
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });
  React.useEffect(() => { if (Array.isArray(data)) setRows(data); }, [data]);

  const fmtMoney = (v: any) => {
    const n = Number(v ?? 0);
    return n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Server already applies q/status/date filters; keep supplier/agent refinement client-side
  const filtered = React.useMemo(() => {
    return rows.filter(r => {
      if (supplierF && String(r.supplier||'').toLowerCase() !== supplierF.toLowerCase()) return false;
      if (agentF && String(r.agent||'').toLowerCase() !== agentF.toLowerCase()) return false;
      return true;
    });
  }, [rows, supplierF, agentF]);

  const togglePaid = async (r: Row) => {
    try {
      await api.setContainerPaid(r.id as any, !r.paid);
      await qc.invalidateQueries({ queryKey: ['containers'] });
      message.success('Sačuvano');
    } catch { message.error('Greška pri čuvanju'); }
  };

  const isEditing = (record: Row) => editingKey === record.id;
  const edit = (record: Row) => {
    form.setFieldsValue({ ...record });
    setEditingKey(record.id);
  };
  const cancel = () => setEditingKey(null);
  const save = async (id: number) => {
    try {
      const v = await form.validateFields();
      const patch: any = { ...v };
      // Normalize numbers
      ['cargo_qty','contain_price','total','deposit','balance'].forEach((k)=>{
        if (k in patch) patch[k] = patch[k] === null || patch[k] === undefined ? 0 : Number(patch[k]);
      });
      // Normalize dates to ISO
      ['etd','delivery','eta'].forEach((k)=>{
        if (patch[k]) patch[k] = (patch[k] as any).format ? (patch[k] as any).format('YYYY-MM-DD') : String(patch[k]);
      });
      await api.updateContainer(id as any, patch);
      await qc.invalidateQueries({ queryKey: ['containers'] });
      setEditingKey(null);
      message.success('Sačuvano');
    } catch {}
  };

  const EditableCell: React.FC<React.HTMLAttributes<HTMLDivElement> & { dataIndex: keyof Row; record: Row; editing: boolean; inputType?: 'text'|'number'|'date'; }>
    = ({ children, dataIndex, record, editing, inputType='text', ...rest }) => {
    let inputNode: React.ReactNode = <Input />;
    if (inputType === 'number') inputNode = <InputNumber style={{ width: '100%' }} />;
    if (inputType === 'date') inputNode = <DatePicker style={{ width: '100%' }} />;
    return (
      <td {...rest}>
        {editing ? (
          <Form.Item name={dataIndex as any} style={{ margin: 0 }} rules={[]}>{inputNode}</Form.Item>
        ) : (
          children
        )}
      </td>
    );
  };

  const cols: ColumnsType<Row> = [
    { title: '#', dataIndex: 'id', width: 70, sorter:(a,b)=> (a.id||0) - (b.id||0) },
    { title: 'Dobavljač', dataIndex: 'supplier', width: 160, onCell: (r)=> ({ record:r, dataIndex:'supplier', editing: isEditing(r) }) as any },
    { title: 'Proforma', dataIndex: 'proforma_no', width: 120, onCell: (r)=> ({ record:r, dataIndex:'proforma_no', editing: isEditing(r) }) as any },
    { title: 'ETD', dataIndex: 'etd', width: 120, render: (v)=> v? dayjs(v).format('DD.MM.YY'):'-', onCell: (r)=> ({ record:r, dataIndex:'etd', editing: isEditing(r), inputType:'date' }) as any },
    { title: 'Delivery', dataIndex: 'delivery', width: 120, render: (v)=> v? dayjs(v).format('DD.MM.YY'):'-', onCell: (r)=> ({ record:r, dataIndex:'delivery', editing: isEditing(r), inputType:'date' }) as any },
    { title: 'ETA', dataIndex: 'eta', width: 120, render: (v)=> v? dayjs(v).format('DD.MM.YY'):'-', onCell: (r)=> ({ record:r, dataIndex:'eta', editing: isEditing(r), inputType:'date' }) as any },
    { title: 'Qty', dataIndex: 'cargo_qty', width: 90, align:'right', onCell: (r)=> ({ record:r, dataIndex:'cargo_qty', editing: isEditing(r), inputType:'number' }) as any },
    { title: 'Tip', dataIndex: 'cargo', width: 110, onCell: (r)=> ({ record:r, dataIndex:'cargo', editing: isEditing(r) }) as any },
    { title: 'Kontejner', dataIndex: 'container_no', width: 140, onCell: (r)=> ({ record:r, dataIndex:'container_no', editing: isEditing(r) }) as any },
    { title: 'Roba', dataIndex: 'roba', width: 140, onCell: (r)=> ({ record:r, dataIndex:'roba', editing: isEditing(r) }) as any },
    { title: 'Cijena', dataIndex: 'contain_price', width: 120, align:'right', render: fmtMoney, onCell: (r)=> ({ record:r, dataIndex:'contain_price', editing: isEditing(r), inputType:'number' }) as any },
    { title: 'Agent', dataIndex: 'agent', width: 120, onCell: (r)=> ({ record:r, dataIndex:'agent', editing: isEditing(r) }) as any },
    { title: 'Total', dataIndex: 'total', width: 120, align:'right', render: fmtMoney, onCell: (r)=> ({ record:r, dataIndex:'total', editing: isEditing(r), inputType:'number' }) as any },
    { title: 'Depozit', dataIndex: 'deposit', width: 120, align:'right', render: fmtMoney, onCell: (r)=> ({ record:r, dataIndex:'deposit', editing: isEditing(r), inputType:'number' }) as any },
    { title: 'Balans', dataIndex: 'balance', width: 120, align:'right', render: fmtMoney },
    { title: 'Plaćeno', dataIndex: 'paid', width: 120, render: (_,r)=> (<Switch checked={!!r.paid} onChange={()=> togglePaid(r)} />) },
    { title: 'Akcije', dataIndex: 'x', fixed:'right', width: 140, render: (_,r)=> isEditing(r) ? (
      <Space>
        <a onClick={()=> save(r.id)}>Sačuvaj</a>
        <a onClick={cancel}>Otkaži</a>
      </Space>
    ) : (
      <a onClick={()=> edit(r)}>Uredi</a>
    ) },
  ];

  return (
    <Card title="Kontejneri (Grid)">
      <Space style={{ marginBottom: 12 }} wrap>
        <Input.Search placeholder="Pretraga…" allowClear value={q} onChange={(e)=> setQ(e.target.value)} style={{ width: 260 }} />
        <Select value={status} onChange={setStatus} allowClear placeholder="Status" style={{ width: 160 }} options={[{value:'paid',label:'Plaćeni'},{value:'unpaid',label:'Neplaćeni'}]} />
        <Select value={dateField} onChange={(v)=> setDateField(v as any)} style={{ width: 120 }} options={[{value:'eta',label:'ETA'},{value:'etd',label:'ETD'}]} />
        <DatePicker placeholder="Od" value={from? dayjs(from): null} onChange={(d)=> setFrom(d? d.format('YYYY-MM-DD'):'')} />
        <DatePicker placeholder="Do" value={to? dayjs(to): null} onChange={(d)=> setTo(d? d.format('YYYY-MM-DD'):'')} />
        <Select allowClear placeholder="Dobavljač" value={supplierF||undefined} onChange={(v)=> setSupplierF(v||'')} style={{ width: 200 }} options={Array.from(new Set(rows.map(r=> r.supplier).filter(Boolean))).map(v=>({value:String(v),label:String(v)}))} />
        <Select allowClear placeholder="Agent" value={agentF||undefined} onChange={(v)=> setAgentF(v||'')} style={{ width: 180 }} options={Array.from(new Set(rows.map(r=> r.agent).filter(Boolean))).map(v=>({value:String(v),label:String(v)}))} />
      </Space>
      <Form form={form} component={false}>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={filtered}
        columns={cols}
        components={{ body: { cell: EditableCell as any } }}
        scroll={{ x: 1500 }}
        pagination={{ pageSize: 20, showSizeChanger: true }}
      />
      </Form>
    </Card>
  );
}
