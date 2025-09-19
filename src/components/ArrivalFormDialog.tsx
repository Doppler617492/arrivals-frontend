import * as React from "react";
import { Modal, Form, Input, Select, DatePicker, Button } from 'antd';
// Loosen type for form to avoid strict backend union constraints
type ArrivalLoose = {
  id?: number;
  supplier?: string;
  plate?: string;
  carrier?: string;
  note?: string;
  type?: string;
  status?: string;
  eta?: string;
};
type ArrivalWithFiles = Partial<ArrivalLoose> & { _files?: File[] };

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: Partial<ArrivalLoose>;
  onSubmit: (payload: Partial<ArrivalLoose>) => Promise<void> | void;
  submitting?: boolean;
  title?: string;
};

const STATUS_OPTIONS = [
  { value: "announced", label: "Najavljeno" },
  { value: "arrived", label: "Stiglo" },
  { value: "in_process", label: "U procesu" },
  { value: "done", label: "Završeno" },
  { value: "delayed", label: "Kašnjenje" },
];

const TYPE_OPTIONS = [
  { value: "truck", label: "Šleper" },
  { value: "container", label: "Kontejner" },
  { value: "van", label: "Kombi" },
  { value: "other", label: "Ostalo" },
];

export default function ArrivalFormDialog({
  open,
  onOpenChange,
  initial = {},
  onSubmit,
  submitting = false,
  title = "Novi dolazak",
}: Props) {
  const [form] = Form.useForm<ArrivalLoose>();
  const [files, setFiles] = React.useState<File[]>([]);
  React.useEffect(() => {
    if (open) {
      const v: any = { status: 'announced', type: 'truck', ...initial };
      form.setFieldsValue(v);
      setFiles([]);
    }
  }, [open, JSON.stringify(initial)]);

  const handleOk = async () => {
    try {
      const v = await form.validateFields();
      const payload: ArrivalWithFiles = {
        ...v,
        supplier: (v.supplier ?? '').toString().trim(),
        plate: (v.plate ?? '').toString().trim(),
        carrier: (v.carrier ?? '').toString().trim() || undefined,
        note: (v.note ?? '').toString().trim() || undefined,
        type: (v.type ?? 'truck').toString().trim(),
        status: (v.status ?? 'announced').toString().trim(),
        eta: v.eta ? (v.eta as any).toISOString?.() || String(v.eta) : undefined,
      };
      if (files.length) (payload as any)._files = files;
      await onSubmit(payload);
      onOpenChange(false);
    } catch {}
  };

  return (
    <Modal open={open} onCancel={() => onOpenChange(false)} onOk={handleOk} okButtonProps={{ loading: submitting }} title={title} destroyOnHidden>
      <Form form={form} layout="vertical">
        <Form.Item name="supplier" label="Dobavljač" rules={[{ required: true, message: 'Obavezno polje' }]}>
          <Input placeholder="npr. Podravka" />
        </Form.Item>
        <Form.Item name="plate" label="Tablice" rules={[{ required: true, message: 'Obavezno polje' }]}>
          <Input placeholder="XYZ-001" />
        </Form.Item>
        <Form.Item name="carrier" label="Prevoznik">
          <Input placeholder="npr. DHL" />
        </Form.Item>
        <Form.Item name="type" label="Tip" initialValue="truck">
          <Select options={[{ value:'truck', label:'Šleper' }, { value:'container', label:'Kontejner' }, { value:'van', label:'Kombi' }, { value:'other', label:'Ostalo' }]} />
        </Form.Item>
        <Form.Item name="eta" label="ETA">
          <DatePicker showTime style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="status" label="Status" initialValue="announced">
          <Select options={STATUS_OPTIONS} />
        </Form.Item>
        <Form.Item name="note" label="Napomena">
          <Input.TextArea rows={3} placeholder="Dodatne informacije…" />
        </Form.Item>
        <Form.Item label="Prilozi (opcionalno)">
          <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.heic,.xlsx,.xls,.csv,.txt,.doc,.docx"
            onChange={(e)=> setFiles(e.currentTarget.files ? Array.from(e.currentTarget.files) : [])} />
          {files.length > 0 && (<div style={{ fontSize: 12, opacity: .7, marginTop: 6 }}>Odabrano fajlova: {files.length}</div>)}
        </Form.Item>
      </Form>
    </Modal>
  );
}
