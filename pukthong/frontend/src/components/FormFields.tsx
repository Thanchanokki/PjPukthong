/**
 * ชิ้นส่วน UI ของฟอร์มที่ใช้ร่วมกันระหว่างหน้า "ตรวจใบเสร็จ" กับ "กรอกเอง"
 *
 * ประกาศไว้นอก component ที่ re-render โดยตั้งใจ — ถ้านิยาม component ข้างในตัวที่
 * re-render React จะ unmount/mount input ใหม่ทุกครั้งที่พิมพ์ แล้ว cursor จะหลุด
 */
import type { LineItem } from "../api";
import { CATEGORIES } from "../categories";
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
/**
 * ดรอปดาวน์หมวด — เลือกจากชุดตายตัวเท่านั้น พิมพ์เองไม่ได้
 *
 * เดิมเป็นช่องพิมพ์อิสระ ซึ่งทำให้ "อาหาร" กับ "อาหารเช้า" กลายเป็นคนละหมวด
 * แล้ว dashboard รวมยอดข้ามเดือนไม่ได้ — ดู categories.ts
 */
export function CategorySelect({
  value,
  onChange,
  className = "field",
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  label?: string;
}) {
  const select = (
    <select
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">— เลือกหมวด —</option>
      {CATEGORIES.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
  if (!label) return select;
  return (
    <div>
      <label className="label">{label}</label>
      {select}
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

      {/* วันที่บนใบ ไม่ใช่วันที่สแกน — ตัวนี้เป็นตัวตัดสินว่ายอดไปอยู่เดือนไหน
          ส่วนเวลาที่สแกนเข้าระบบ ระบบบันทึกให้เองและแก้ไม่ได้ */}
      <Field
        label="วันที่บนใบเสร็จ *"
        type="date"
        value={form.purchased_at}
        onChange={onChange("purchased_at")}
        warn={warn("issued_at")}
      />
      <Field
        label="เวลาบนใบเสร็จ"
        type="time"
        value={form.purchased_time}
        onChange={onChange("purchased_time")}
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

/**
 * ราคาต่อชิ้นที่คำนวณจากจำนวนกับยอดรวมของบรรทัดนั้น
 *
 * เป็นตัวช่วยตรวจ ไม่ใช่ช่องกรอก — ถ้า AI อ่านจำนวนหรือยอดผิด ตัวเลขนี้จะดูผิดปกติ
 * ทันที (เช่น นม 2 กล่อง 450 บาท -> 225/ชิ้น) ทำให้จับได้ก่อนกดบันทึก
 */
function UnitPriceHint({
  qty,
  amount,
}: {
  qty: string | null;
  amount: string | null;
}) {
  const q = Number(qty);
  const a = Number(amount);
  // ไม่แสดงตอนจำนวนเป็น 1 เพราะราคาต่อชิ้นก็คือยอดนั้นเอง ไม่ได้ให้ข้อมูลเพิ่ม
  if (!Number.isFinite(q) || !Number.isFinite(a) || q <= 1 || a <= 0) return null;
  return (
    <span className="text-xs text-slate-400">
      ≈ ฿{(a / q).toLocaleString("th-TH", { maximumFractionDigits: 2 })}/ชิ้น
    </span>
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
  const patch = (i: number, key: "name" | "amount" | "qty" | "category", v: string) =>
    setItems((xs) =>
      xs.map((x, j) =>
        j === i ? { ...x, [key]: key === "category" && v === "" ? null : v } : x,
      ),
    );

  /** หมวดที่ AI เดามาใช้เป็นค่าตั้งต้น จนกว่าผู้ใช้จะแก้ */
  const categoryOf = (it: LineItem) => it.category ?? it.category_guess ?? "";

  // แถวว่างที่ยังไม่ได้กรอกอะไรเลย (เพิ่งกด + เพิ่มรายการ) ไม่ควรถูกนับว่าเป็น
  // "รายการ" จริง — ตัวเลขในหัวข้อจึงนับเฉพาะแถวที่มีชื่อหรือยอดแล้วเท่านั้น
  const filledCount = items.filter(
    (it) => (it.name ?? "").trim() !== "" || (it.amount ?? "") !== "",
  ).length;

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <span className="text-sm font-medium">รายการสินค้า ({filledCount})</span>
        {incomplete && <span className="text-xs text-amber-700">⚠️ อ่านได้ไม่ครบ</span>}
      </div>

      {items.length > 0 && (
        <div className="flex items-center gap-2 px-3 pt-2 text-xs text-slate-400">
          <span className="w-14 shrink-0 text-center">จำนวน</span>
          <span className="min-w-0 flex-1">รายการ</span>
          <span className="w-20 shrink-0 text-right">ราคา</span>
          {/* ช่องว่างให้เท่ากับปุ่ม ✕ ทางขวาสุดของแต่ละแถว หัวคอลัมน์จะได้ตรงกัน */}
          <span className="w-5 shrink-0" aria-hidden="true" />
        </div>
      )}

      {items.length > 0 && (
        <ul className="divide-y divide-slate-100 text-sm">
          {items.map((it, i) => (
            <li key={i} className="px-3 py-2">
              <div className="flex items-center gap-2">
              {/* จำนวนรับทศนิยมได้ (ของชั่งกิโล เช่น 0.375) — backend เก็บถึง 3 ตำแหน่ง */}
              <input
                className="field w-14 shrink-0 text-center"
                value={it.qty ?? ""}
                inputMode="decimal"
                placeholder="จำนวน"
                aria-label="จำนวน"
                onChange={(e) => patch(i, "qty", e.target.value)}
              />
              <input
                className="field min-w-0 flex-1"
                value={it.name ?? ""}
                placeholder="ชื่อรายการ"
                onChange={(e) => patch(i, "name", e.target.value)}
              />
              <input
                className="field w-20 shrink-0 text-right"
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
              </div>

              {/* หมวดรายชิ้นคือสิ่งที่ dashboard เอาไปสรุป — ต้องแก้ได้ง่ายตรงนี้
                  ช่องที่ยังไม่มีหมวดจะเป็นสีเหลืองเพื่อให้เห็นว่าต้องเลือกเอง */}
              <div className="mt-1.5 flex items-center gap-2 pl-1">
                <span className="text-xs text-slate-400">หมวด</span>
                <CategorySelect
                  value={categoryOf(it)}
                  onChange={(v) => patch(i, "category", v)}
                  className={`field h-8 w-44 py-0 text-xs ${
                    categoryOf(it) ? "" : "field-warn"
                  }`}
                />
                <UnitPriceHint qty={it.qty} amount={it.amount} />
              </div>
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
  variant = "primary",
}: {
  onSave: () => void;
  disabled: boolean;
  pending: boolean;
  /**
   * "stamp" = ปุ่มแดงตาม mockup หน้ากรอกด้วยตนเอง
   * "primary" (ค่าเริ่มต้น) = ปุ่มเขียว teal เดิม ใช้ที่หน้ารีวิว OCR ต่อไปเหมือนเดิม
   */
  variant?: "primary" | "stamp";
}) {
  return (
    <div className="sticky bottom-0 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
      <button
        onClick={onSave}
        disabled={disabled || pending}
        className={
          variant === "stamp"
            ? "w-full rounded-lg bg-stamp py-3 text-base font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            : "btn-primary w-full py-3 text-base"
        }
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