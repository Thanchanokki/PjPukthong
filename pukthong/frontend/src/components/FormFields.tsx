/**
 * ชิ้นส่วน UI ของฟอร์มที่ใช้ร่วมกันระหว่างหน้า "ตรวจใบเสร็จ" กับ "กรอกเอง"
 *
 * ประกาศไว้นอก component ที่ re-render โดยตั้งใจ — ถ้านิยาม component ข้างในตัวที่
 * re-render React จะ unmount/mount input ใหม่ทุกครั้งที่พิมพ์ แล้ว cursor จะหลุด
 */
import type { LineItem } from "../api";
import { type Form, emptyItem } from "./TransactionForm";

export function Field({
  label,
  value,
  onChange,
  warn = false,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  warn?: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="label">
        {label} {warn && <span title="AI ไม่มั่นใจฟิลด์นี้">⚠️</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={type === "number" ? "decimal" : undefined}
        className={`field ${warn ? "field-warn" : ""}`}
      />
    </div>
  );
}

/** รายรับ/รายจ่าย — AI ไม่ได้บอกมา ผู้ใช้เลือกเอง */
export function DirectionToggle({
  value,
  onChange,
}: {
  value: Form["direction"];
  onChange: (v: Form["direction"]) => void;
}) {
  return (
    <div className="flex gap-2">
      {(["expense", "income"] as const).map((d) => (
        <button
          key={d}
          onClick={() => onChange(d)}
          className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
            value === d
              ? "border-teal-700 bg-teal-700 text-white"
              : "border-slate-300 bg-white text-slate-600"
          }`}
        >
          {d === "expense" ? "รายจ่าย" : "รายรับ"}
        </button>
      ))}
    </div>
  );
}

/** ช่องกรอกทั้งหมดของรายการหนึ่งใบ (ไม่รวมรายการสินค้าและปุ่มบันทึก) */
export function TransactionFields({
  form,
  onChange,
  warnSet,
}: {
  form: Form;
  onChange: (k: keyof Form) => (v: string) => void;
  warnSet?: Set<string>;
}) {
  const warn = (k: string) => warnSet?.has(k) ?? false;

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <Field
          label="ชื่อร้าน"
          value={form.merchant_name}
          onChange={onChange("merchant_name")}
          warn={warn("merchant_name")}
        />
      </div>
      <Field label="สาขา" value={form.branch} onChange={onChange("branch")} />
      <Field
        label="เลขที่เอกสาร"
        value={form.doc_number}
        onChange={onChange("doc_number")}
      />
      <div className="col-span-2">
        <Field
          label="เลขผู้เสียภาษี"
          value={form.merchant_tax_id}
          onChange={onChange("merchant_tax_id")}
          warn={warn("merchant_tax_id")}
        />
      </div>

      <Field
        label="วันที่ *"
        type="date"
        value={form.occurred_on}
        onChange={onChange("occurred_on")}
        warn={warn("issued_at")}
      />
      <Field
        label="เวลา"
        type="time"
        value={form.occurred_at_time}
        onChange={onChange("occurred_at_time")}
      />

      <Field
        label="ยอดก่อน VAT"
        type="number"
        value={form.subtotal}
        onChange={onChange("subtotal")}
      />
      <Field
        label="ส่วนลด"
        type="number"
        value={form.discount}
        onChange={onChange("discount")}
      />
      <Field
        label="ค่าบริการ"
        type="number"
        value={form.service_charge}
        onChange={onChange("service_charge")}
      />
      <Field
        label="VAT (%)"
        type="number"
        value={form.vat_rate}
        onChange={onChange("vat_rate")}
      />
      <Field
        label="ยอด VAT"
        type="number"
        value={form.vat_amount}
        onChange={onChange("vat_amount")}
      />
      <Field
        label="ยอดรวม *"
        type="number"
        value={form.total}
        onChange={onChange("total")}
        warn={warn("total")}
      />

      <Field
        label="หมวด"
        value={form.category}
        onChange={onChange("category")}
        placeholder="อาหาร, เดินทาง, …"
      />
      <Field
        label="ช่องทางจ่าย"
        value={form.payment_method}
        onChange={onChange("payment_method")}
        placeholder="cash, card, …"
      />
      <div className="col-span-2">
        <Field label="หมายเหตุ" value={form.note} onChange={onChange("note")} />
      </div>
    </div>
  );
}

/** รายการสินค้า — แก้ ลบ และเพิ่มบรรทัดเองได้ (ตอน AI อ่านมาไม่ครบ) */
export function ItemsEditor({
  items,
  setItems,
  incomplete = false,
}: {
  items: LineItem[];
  setItems: React.Dispatch<React.SetStateAction<LineItem[]>>;
  incomplete?: boolean;
}) {
  const patch = (i: number, key: "name" | "amount", v: string) =>
    setItems((xs) => xs.map((x, j) => (j === i ? { ...x, [key]: v } : x)));

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <span className="text-sm font-medium">รายการสินค้า ({items.length})</span>
        {incomplete && <span className="text-xs text-amber-700">⚠️ อ่านได้ไม่ครบ</span>}
      </div>

      {items.length > 0 && (
        <ul className="divide-y divide-slate-100 text-sm">
          {items.map((it, i) => (
            <li key={i} className="flex items-center gap-2 px-3 py-2">
              <input
                className="field flex-1"
                value={it.name ?? ""}
                placeholder="ชื่อรายการ"
                onChange={(e) => patch(i, "name", e.target.value)}
              />
              <input
                className="field w-24 text-right"
                value={it.amount ?? ""}
                inputMode="decimal"
                placeholder="0.00"
                onChange={(e) => patch(i, "amount", e.target.value)}
              />
              {it.flag && (
                <span
                  className="rounded bg-slate-200 px-1.5 py-0.5 text-xs"
                  title="ตัวอักษรกำกับราคาบนใบเสร็จ"
                >
                  {it.flag}
                </span>
              )}
              <button
                onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}
                className="px-1 text-slate-400 hover:text-red-600"
                title="ลบรายการนี้"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="px-3 py-2">
        <button
          onClick={() => setItems((xs) => [...xs, emptyItem()])}
          className="btn-ghost w-full"
        >
          + เพิ่มรายการ
        </button>
      </div>
    </div>
  );
}

/** ปุ่มบันทึกที่ติดขอบล่างจอ — กดได้เมื่อมียอดรวมและวันที่ครบ */
export function SaveBar({
  onSave,
  disabled,
  pending,
}: {
  onSave: () => void;
  disabled: boolean;
  pending: boolean;
}) {
  return (
    <div className="sticky bottom-0 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
      <button
        onClick={onSave}
        disabled={disabled || pending}
        className="btn-primary w-full py-3 text-base"
      >
        {pending ? "กำลังบันทึก…" : "บันทึกรายการ"}
      </button>
      {disabled && (
        <p className="mt-1 text-center text-xs text-slate-500">
          ต้องมี “ยอดรวม” และ “วันที่” ก่อนจึงจะบันทึกได้
        </p>
      )}
    </div>
  );
}
