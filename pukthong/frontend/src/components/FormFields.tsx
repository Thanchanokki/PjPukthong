/**
 * ชิ้นส่วน UI ของฟอร์มที่ใช้ร่วมกันระหว่างหน้า "ตรวจใบเสร็จ" กับ "กรอกเอง"
 *
 * ประกาศไว้นอก component ที่ re-render โดยตั้งใจ — ถ้านิยาม component ข้างในตัวที่
 * re-render React จะ unmount/mount input ใหม่ทุกครั้งที่พิมพ์ แล้ว cursor จะหลุด
 */
import { useState } from "react";

import type { BillDiscount, LineItem } from "../api";
import { groupCategories, labelOf, useCategories, useMerchantTypes } from "../categories";
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
 * ดรอปดาวน์หมวด — เลือกจากหมวดที่มีอยู่เท่านั้น พิมพ์เองไม่ได้ ค่าที่ได้คือ id ของหมวด
 *
 * เดิมเป็นช่องพิมพ์อิสระ ซึ่งทำให้ "อาหาร" กับ "อาหารเช้า" กลายเป็นคนละหมวด
 * แล้ว dashboard รวมยอดข้ามเดือนไม่ได้ — อยากได้หมวดใหม่ให้สร้างที่หน้า "หมวดหมู่"
 * หมวดหลักที่มีหมวดย่อยแสดงเป็น <optgroup> แต่ตัวหมวดหลักเองก็ยังเลือกได้
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
  const { data: categories = [] } = useCategories();
  const select = (
    <select
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">— เลือกหมวด —</option>
      {groupCategories(categories).map(({ root, children }) =>
        children.length === 0 ? (
          <option key={root.id} value={root.id}>
            {labelOf(root)}
          </option>
        ) : (
          <optgroup key={root.id} label={labelOf(root)}>
            <option value={root.id}>{labelOf(root)} (ทั่วไป)</option>
            {children.map((c) => (
              <option key={c.id} value={c.id}>
                {labelOf(c)}
              </option>
            ))}
          </optgroup>
        ),
      )}
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

/**
 * ประเภทกรมธรรม์ — ต้องตรงกับ backend/src/shared/insurance.ts (id ใช้คิดสิทธิลดหย่อนภาษี)
 */
const POLICY_TYPES = [
  { id: "life", name: "ประกันชีวิต" },
  { id: "health", name: "ประกันสุขภาพ (ตนเอง)" },
  { id: "health_parents", name: "ประกันสุขภาพบิดามารดา" },
  { id: "annuity", name: "ประกันชีวิตแบบบำนาญ" },
  { id: "non_life", name: "ประกันวินาศภัย (รถยนต์/อุบัติเหตุ ฯลฯ)" },
  { id: "other", name: "อื่นๆ" },
];

/**
 * ข้อมูลกรมธรรม์ — ใบเสร็จค่าเบี้ยประกันไม่มีรายการสินค้า จึงเก็บข้อมูลนี้แทน
 * ใช้สรุปเบี้ยประกันรายปีเพื่อลดหย่อนภาษี (หน้า "ลดหย่อนภาษี")
 */
function InsuranceFields({
  form,
  onChange,
}: {
  form: Form;
  onChange: (k: keyof Form) => (v: string) => void;
}) {
  return (
    <div className="col-span-2 grid grid-cols-2 gap-3 rounded-xl border border-teal-200 bg-teal-50/50 p-3">
      <p className="col-span-2 text-sm font-medium text-teal-900">🛡️ ข้อมูลกรมธรรม์</p>
      <div className="col-span-2">
        <Field label="บริษัทประกัน" value={form.ins_insurer} onChange={onChange("ins_insurer")} />
      </div>
      <Field label="เลขที่กรมธรรม์" value={form.ins_policy_number} onChange={onChange("ins_policy_number")} />
      <div>
        <label className="label">ประเภทกรมธรรม์</label>
        <select
          className={`field ${form.ins_policy_type ? "" : "field-warn"}`}
          value={form.ins_policy_type}
          onChange={(e) => onChange("ins_policy_type")(e.target.value)}
        >
          <option value="">— เลือกประเภท —</option>
          {POLICY_TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <div className="col-span-2">
        <Field label="ผู้เอาประกัน" value={form.ins_insured_name} onChange={onChange("ins_insured_name")} />
      </div>
      <Field label="คุ้มครองตั้งแต่" type="date" value={form.ins_coverage_start} onChange={onChange("ins_coverage_start")} />
      <Field label="คุ้มครองถึง" type="date" value={form.ins_coverage_end} onChange={onChange("ins_coverage_end")} />
      <div className="col-span-2">
        <Field label="จำนวนเบี้ยประกัน" type="number" value={form.ins_premium} onChange={onChange("ins_premium")} />
      </div>
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
  const { data: merchantTypes = [] } = useMerchantTypes();
  const { data: categories = [] } = useCategories();
  const selectedType = merchantTypes.find((t) => t.id === form.merchant_type);
  const defaultName =
    selectedType?.default_category_id && !selectedType.no_items
      ? categories.find((c) => c.id === selectedType.default_category_id)?.name
      : null;

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
      {/* ประเภทร้านของทั้งใบ — ใช้ทำงบ "ตามประเภทร้าน" (คนละเรื่องกับหมวดของสินค้ารายชิ้น) */}
      <div className="col-span-2">
        <label className="label">ประเภทร้าน</label>
        <select
          className={`field ${form.merchant_type ? "" : "field-warn"}`}
          value={form.merchant_type}
          onChange={(e) => onChange("merchant_type")(e.target.value)}
        >
          <option value="">— เลือกประเภทร้าน —</option>
          {merchantTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.icon} {t.name}
            </option>
          ))}
        </select>
        {defaultName && (
          <p className="mt-1 text-xs text-slate-500">
            ทุกรายการในใบนี้ตั้งเป็นหมวด "{defaultName}" ให้อัตโนมัติ แก้รายชิ้นได้ด้านล่าง
          </p>
        )}
      </div>
      {form.merchant_type === "insurance" && <InsuranceFields form={form} onChange={onChange} />}
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
const money = (v: string | null | undefined) => {
  const n = Number(v);
  return v === null || v === undefined || v === "" || !Number.isFinite(n) ? null : n;
};
const fmt = (n: number) =>
  n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * แก้ราคาของรายการแล้วให้สามช่องสอดคล้องกันเสมอ: ราคาเต็ม − ส่วนลด = สุทธิ
 * - แก้ราคาเต็มหรือส่วนลด -> คำนวณสุทธิใหม่
 * - แก้สุทธิโดยตรงขณะมีส่วนลด -> ราคาเต็ม = สุทธิ + ส่วนลด
 */
function repriceItem(x: LineItem, key: "gross_amount" | "discount" | "amount", v: string): LineItem {
  const next = { ...x, [key]: v === "" ? null : v };
  const gross = money(next.gross_amount);
  const disc = money(next.discount) ?? 0;
  if (key !== "amount" && gross !== null) return { ...next, amount: (gross - disc).toFixed(2) };
  if (key === "amount" && disc > 0 && money(v) !== null) {
    return { ...next, gross_amount: (money(v)! + disc).toFixed(2) };
  }
  return next;
}

/** ยอดของบิลที่ใช้สรุปใต้รายการสินค้า (มาจากฟอร์มของใบ) */
type BillTotals = { service_charge: string; total: string };

const DISCOUNT_KIND: Record<BillDiscount["kind"], { icon: string; name: string }> = {
  discount: { icon: "🏷️", name: "ส่วนลดท้ายบิล" },
  member: { icon: "👤", name: "ส่วนลดสมาชิก" },
  coupon: { icon: "🎟️", name: "คูปอง" },
  points: { icon: "⭐", name: "ใช้คะแนน" },
};

/** ข้อความของส่วนลดหนึ่งก้อน เช่น "⭐ ใช้คะแนน The 1 (500 คะแนน)" */
export function billDiscountText(b: BillDiscount) {
  const k = DISCOUNT_KIND[b.kind] ?? DISCOUNT_KIND.discount;
  const pts = b.kind === "points" && money(b.points_used) ? ` (${Number(b.points_used).toLocaleString("th-TH")} คะแนน)` : "";
  return `${k.icon} ${k.name}${b.label ? ` ${b.label}` : ""}${pts}`;
}

export function ItemsEditor({
  items,
  setItems,
  incomplete = false,
  totals,
  billDiscounts = [],
  setBillDiscounts,
}: {
  items: LineItem[];
  setItems: React.Dispatch<React.SetStateAction<LineItem[]>>;
  incomplete?: boolean;
  /** ส่งมาเพื่อแสดงสรุป ราคาก่อนลด / ส่วนลด / ยอดสุทธิ ใต้รายการ */
  totals?: BillTotals;
  /** ส่วนลดท้ายบิลแยกก้อน (ส่วนลด / สมาชิก / คูปอง / ใช้คะแนน) — แสดงและแก้ในกล่องสรุป */
  billDiscounts?: BillDiscount[];
  setBillDiscounts?: React.Dispatch<React.SetStateAction<BillDiscount[]>>;
}) {
  const patch = (i: number, key: "name" | "amount" | "qty" | "category_id", v: string) =>
    setItems((xs) =>
      xs.map((x, j) => {
        if (j !== i) return x;
        if (key === "amount") return repriceItem(x, "amount", v);
        return { ...x, [key]: key === "category_id" && v === "" ? null : v };
      }),
    );
  const patchPrice = (i: number, key: "gross_amount" | "discount", v: string) =>
    setItems((xs) => xs.map((x, j) => (j === i ? repriceItem(x, key, v) : x)));
  /** แถวที่กำลังแก้ส่วนลด (กด "+ ส่วนลด" หรือ "แก้ไข") — นอกนั้นแสดงส่วนลดเป็นข้อความ */
  const [editingDiscount, setEditingDiscount] = useState<Set<number>>(new Set());
  const toggleEdit = (i: number, on: boolean) => {
    // เริ่มใส่ส่วนลด: ราคาเต็มเริ่มจากราคาที่กรอกไว้ ส่วนลดที่ใส่ภายหลังจะหักจากตัวนี้
    if (on) setItems((xs) => xs.map((x, j) => (j === i && !x.gross_amount ? { ...x, gross_amount: x.amount } : x)));
    setEditingDiscount((s) => {
      const n = new Set(s);
      if (on) n.add(i);
      else n.delete(i);
      return n;
    });
  };
  const patchLabel = (i: number, v: string) =>
    setItems((xs) => xs.map((x, j) => (j === i ? { ...x, discount_label: v || null } : x)));

  /** หมวดที่ AI เดามาใช้เป็นค่าตั้งต้น จนกว่าผู้ใช้จะแก้ */
  const categoryOf = (it: LineItem) => it.category_id ?? it.category_guess ?? "";

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
              {/* มีส่วนลด = ช่องนี้คือราคาเต็ม (ส่วนลดแสดงเป็นข้อความด้านล่าง) ไม่มี = ราคาที่จ่าย */}
              <input
                className="field w-20 shrink-0 text-right"
                value={(money(it.discount) ? it.gross_amount : it.amount) ?? ""}
                inputMode="decimal"
                placeholder="0.00"
                aria-label={money(it.discount) ? "ราคาเต็ม" : "ราคา"}
                onChange={(e) =>
                  money(it.discount)
                    ? patchPrice(i, "gross_amount", e.target.value)
                    : patch(i, "amount", e.target.value)
                }
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
                  onChange={(v) => patch(i, "category_id", v)}
                  className={`field h-8 w-44 py-0 text-xs ${
                    categoryOf(it) ? "" : "field-warn"
                  }`}
                />
                <UnitPriceHint qty={it.qty} amount={it.amount} />
                {!money(it.discount) && !editingDiscount.has(i) && (
                  <button
                    type="button"
                    onClick={() => toggleEdit(i, true)}
                    className="ml-auto text-xs text-teal-700 hover:underline"
                  >
                    + ส่วนลด
                  </button>
                )}
              </div>

              {/* ส่วนลดเป็น "ข้อความ" ใต้สินค้า ไม่ใช่รายการสินค้าอีกแถว — กดแก้ไขถึงจะเป็นช่องกรอก */}
              {money(it.discount) !== null && !editingDiscount.has(i) && (
                <div className="mt-1 flex items-center gap-2 pl-1 text-xs text-red-700">
                  <span aria-hidden="true">🏷️</span>
                  <span className="min-w-0 flex-1 truncate">
                    ส่วนลด{it.discount_label ? ` ${it.discount_label}` : ""}
                  </span>
                  <span className="tabular-nums">−{fmt(money(it.discount)!)}</span>
                  <span className="text-slate-500">
                    จ่ายจริง <span className="font-medium tabular-nums text-ink">{fmt(money(it.amount) ?? 0)}</span>
                  </span>
                  <button type="button" onClick={() => toggleEdit(i, true)} className="text-teal-700 hover:underline">
                    แก้ไข
                  </button>
                </div>
              )}
              {editingDiscount.has(i) && (
                <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-lg bg-red-50 p-2 pl-2 text-xs">
                  <span aria-hidden="true">🏷️</span>
                  <input
                    className="field h-8 min-w-0 flex-1 py-0 text-xs"
                    value={it.discount_label ?? ""}
                    placeholder="ชื่อส่วนลด เช่น โปร 2 ชิ้น"
                    aria-label="ชื่อส่วนลด"
                    onChange={(e) => patchLabel(i, e.target.value)}
                  />
                  <span className="text-slate-500">ลด</span>
                  <input
                    className="field h-8 w-20 py-0 text-right text-xs text-red-700"
                    value={it.discount ?? ""}
                    inputMode="decimal"
                    placeholder="0.00"
                    aria-label="ยอดส่วนลด"
                    onChange={(e) => patchPrice(i, "discount", e.target.value)}
                  />
                  <button type="button" onClick={() => toggleEdit(i, false)} className="font-medium text-teal-700">
                    เสร็จ
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {totals && filledCount > 0 && (
        <ItemsSummary
          items={items}
          totals={totals}
          billDiscounts={billDiscounts}
          setBillDiscounts={setBillDiscounts}
        />
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

/**
 * สรุปราคาของทั้งใบจากรายการสินค้า — ให้เห็นว่าซื้อเท่าไหร่ ลดไปเท่าไหร่ จ่ายจริงเท่าไหร่
 * และเตือนเมื่อยอดที่คำนวณได้ไม่ตรงกับยอดรวมบนใบ (มักแปลว่าอ่านรายการหรือส่วนลดตกหล่น)
 */
function ItemsSummary({
  items,
  totals,
  billDiscounts,
  setBillDiscounts,
}: {
  items: LineItem[];
  totals: BillTotals;
  billDiscounts: BillDiscount[];
  setBillDiscounts?: React.Dispatch<React.SetStateAction<BillDiscount[]>>;
}) {
  const net = items.reduce((s, it) => s + (money(it.amount) ?? 0), 0);
  const itemDisc = items.reduce((s, it) => s + (money(it.discount) ?? 0), 0);
  const gross = net + itemDisc;
  const billDisc = billDiscounts.reduce((s, b) => s + (money(b.amount) ?? 0), 0);
  const [adding, setAdding] = useState(false);
  const service = money(totals.service_charge) ?? 0;
  const calc = net - billDisc + service;
  const printed = money(totals.total);
  const diff = printed === null ? 0 : Math.round((calc - printed) * 100) / 100;

  const row = (label: string, value: number, cls = "") => (
    <div className="flex justify-between">
      <span className="text-slate-500">{label}</span>
      <span className={`tabular-nums ${cls}`}>{fmt(value)}</span>
    </div>
  );
  return (
    <div className="space-y-1 border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs">
      {row("ราคารวมก่อนลด", gross)}
      {itemDisc > 0 && row("🏷️ ส่วนลดรายการ", -itemDisc, "text-red-700")}
      {/* ส่วนลดท้ายบิลเป็นข้อความทีละก้อน — ไม่ใช่รายการสินค้า */}
      {billDiscounts.map((b, i) => (
        <div key={i} className="flex items-center gap-2 text-red-700">
          <span className="min-w-0 flex-1 truncate">{billDiscountText(b)}</span>
          <span className="tabular-nums">−{fmt(money(b.amount) ?? 0)}</span>
          {setBillDiscounts && (
            <button
              type="button"
              aria-label="ลบส่วนลดนี้"
              onClick={() => setBillDiscounts((xs) => xs.filter((_, j) => j !== i))}
              className="px-1 text-slate-400 hover:text-red-600"
            >
              ✕
            </button>
          )}
        </div>
      ))}
      {setBillDiscounts &&
        (adding ? (
          <AddBillDiscount
            onCancel={() => setAdding(false)}
            onAdd={(b) => {
              setBillDiscounts((xs) => [...xs, b]);
              setAdding(false);
            }}
          />
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="text-teal-700 hover:underline">
            + ส่วนลดท้ายบิล / คูปอง / ใช้คะแนน
          </button>
        ))}
      {service > 0 && row("ค่าบริการ", service)}
      <div className="flex justify-between border-t border-slate-200 pt-1 text-sm font-semibold">
        <span>ยอดสุทธิที่จ่ายจริง</span>
        <span className="tabular-nums">{fmt(calc)}</span>
      </div>
      {printed !== null && diff !== 0 && Math.abs(diff) > 1 && (
        <p className="text-amber-700">
          ⚠️ ต่างจากยอดรวมบนใบ ({fmt(printed)}) อยู่ {fmt(Math.abs(diff))} บาท — ตรวจรายการหรือส่วนลดที่อาจตกหล่น
        </p>
      )}
    </div>
  );
}

function AddBillDiscount({
  onAdd,
  onCancel,
}: {
  onAdd: (b: BillDiscount) => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<BillDiscount["kind"]>("discount");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [points, setPoints] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-white p-2">
      <select
        className="field h-8 w-32 py-0 text-xs"
        value={kind}
        onChange={(e) => setKind(e.target.value as BillDiscount["kind"])}
        aria-label="ชนิดส่วนลด"
      >
        {Object.entries(DISCOUNT_KIND).map(([k, v]) => (
          <option key={k} value={k}>
            {v.icon} {v.name}
          </option>
        ))}
      </select>
      <input
        className="field h-8 min-w-0 flex-1 py-0 text-xs"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder={kind === "points" ? "เช่น The 1, M-Stamp" : "ชื่อส่วนลด (ไม่บังคับ)"}
        aria-label="ชื่อส่วนลด"
      />
      {kind === "points" && (
        <input
          className="field h-8 w-20 py-0 text-right text-xs"
          value={points}
          inputMode="numeric"
          onChange={(e) => setPoints(e.target.value)}
          placeholder="คะแนน"
          aria-label="คะแนนที่ใช้"
        />
      )}
      <input
        className="field h-8 w-20 py-0 text-right text-xs text-red-700"
        value={amount}
        inputMode="decimal"
        onChange={(e) => setAmount(e.target.value)}
        placeholder="บาท"
        aria-label="ยอดส่วนลด"
      />
      <button
        type="button"
        disabled={!(money(amount) && money(amount)! > 0)}
        onClick={() =>
          onAdd({ kind, label: label.trim() || null, amount: Number(amount).toFixed(2), points_used: kind === "points" && points ? points : null })
        }
        className="font-medium text-teal-700 disabled:text-slate-300"
      >
        เพิ่ม
      </button>
      <button type="button" onClick={onCancel} className="text-slate-500">
        ยกเลิก
      </button>
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