/**
 * ส่วนประกอบของหน้า "ตรวจสอบข้อมูล" (ขั้น 3 ของ flow สแกน) — แบ่งเป็นกล่องตามหัวข้อ
 * ข้อมูลร้านค้า · รายการสินค้า · ส่วนลดและ VAT · การชำระเงิน · สรุปยอด + แถบยอดสุทธิติดล่างจอ
 *
 * ตรรกะราคา (ราคาเต็ม − ส่วนลด = สุทธิ, ส่วนลดท้ายบิลแยกก้อน) ใช้ตัวเดียวกับ FormFields.tsx
 * ประกาศ component นอกตัวที่ re-render ทุกตัว ไม่งั้น input ถูกสร้างใหม่ทุกครั้งที่พิมพ์แล้ว cursor หลุด
 */
import { useState } from "react";

import type { BillDiscount, LineItem } from "../api";
import { useCategories, useMerchantTypes } from "../categories";
import {
  AddBillDiscount,
  InsuranceFields,
  billDiscountText,
  fmt,
  money,
  repriceItem,
} from "./FormFields";
import { type Form, emptyItem } from "./TransactionForm";
import { CardIcon, ListLinesIcon, PercentIcon, StoreIcon, XIcon } from "./icons";

type OnChange = (k: keyof Form) => (v: string) => void;

// ---------------------------------------------------------------- ชิ้นส่วนพื้นฐาน

export function Section({
  icon,
  title,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <header className="mb-4 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-mist text-pine">{icon}</span>
        <h2 className="flex-1 font-bold text-ink">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

const inputCls = (bad = false) =>
  `h-12 w-full rounded-xl px-4 text-[15px] text-ink outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-pine/40 ${
    bad ? "bg-red-50 ring-1 ring-red-300" : "bg-slate-100"
  }`;

export function MField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
  warn = false,
  align = "left",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  /** AI ไม่มั่นใจค่านี้ */
  warn?: boolean;
  align?: "left" | "right";
}) {
  const bad = (required && !value.trim()) || warn;
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-ink/70">
        {label}
        {required && <span className="text-red-500"> *</span>}
        {warn && <span className="ml-1 text-amber-600" title="ระบบไม่มั่นใจค่านี้">⚠️</span>}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder ?? label}
        inputMode={type === "number" ? "decimal" : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputCls(bad)} ${align === "right" ? "text-right" : ""}`}
      />
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-xl bg-slate-100 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`h-10 flex-1 rounded-lg text-sm transition ${
            value === o.value ? "bg-white font-bold text-pine shadow-sm" : "text-ink/60"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- ข้อมูลร้านค้า

export function StoreSection({ form, onChange, warn }: { form: Form; onChange: OnChange; warn: (k: string) => boolean }) {
  const { data: merchantTypes = [] } = useMerchantTypes();
  const { data: categories = [] } = useCategories();
  const type = merchantTypes.find((t) => t.id === form.merchant_type);
  const defaultName =
    type?.default_category_id && !type.no_items
      ? categories.find((c) => c.id === type.default_category_id)?.name
      : null;

  return (
    <Section icon={<StoreIcon className="h-5 w-5" />} title="ข้อมูลร้านค้า">
      <div className="grid grid-cols-2 gap-x-3 gap-y-4">
        <div className="col-span-2">
          <MField label="ชื่อร้าน" value={form.merchant_name} onChange={onChange("merchant_name")} warn={warn("merchant_name")} />
        </div>
        <label className="col-span-2 block">
          <span className="mb-1.5 block text-sm text-ink/70">
            ประเภทร้าน<span className="text-red-500"> *</span>
          </span>
          <select
            value={form.merchant_type}
            onChange={(e) => onChange("merchant_type")(e.target.value)}
            className={`${inputCls(!form.merchant_type)} appearance-none ${form.merchant_type ? "" : "text-slate-400"}`}
          >
            <option value="">เลือกประเภทร้าน</option>
            {merchantTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.icon} {t.name}
              </option>
            ))}
          </select>
          {defaultName && (
            <span className="mt-1.5 block text-xs text-ink/55">
              ทุกรายการตั้งเป็นหมวด "{defaultName}" ให้อัตโนมัติ แก้รายชิ้นได้ในรายการสินค้า
            </span>
          )}
        </label>
        {form.merchant_type === "insurance" && <InsuranceFields form={form} onChange={onChange} />}
        <MField label="สาขา" value={form.branch} onChange={onChange("branch")} />
        <MField label="เลขที่เอกสาร" value={form.doc_number} onChange={onChange("doc_number")} />
        <div className="col-span-2">
          <MField
            label="เลขผู้เสียภาษี"
            value={form.merchant_tax_id}
            onChange={onChange("merchant_tax_id")}
            warn={warn("merchant_tax_id")}
          />
        </div>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------- รายการสินค้า

export function ItemsSection({
  items,
  setItems,
  incomplete,
}: {
  items: LineItem[];
  setItems: React.Dispatch<React.SetStateAction<LineItem[]>>;
  incomplete: boolean;
}) {
  const { data: categories = [] } = useCategories();
  /** แถวที่กำลังแก้ — แตะแถวเพื่อเปิด/ปิด */
  const [open, setOpen] = useState<number | null>(null);
  const filled = items.filter((it) => (it.name ?? "").trim() || (it.amount ?? "") !== "").length;

  const update = (i: number, fn: (x: LineItem) => LineItem) =>
    setItems((xs) => xs.map((x, j) => (j === i ? fn(x) : x)));

  return (
    <Section
      icon={<ListLinesIcon className="h-5 w-5" />}
      title={`รายการสินค้า (${filled})`}
      action={
        <button
          type="button"
          onClick={() => {
            setItems((xs) => [...xs, emptyItem()]);
            setOpen(items.length);
          }}
          className="text-sm font-bold text-pine"
        >
          + เพิ่ม
        </button>
      }
    >
      {incomplete && <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">⚠️ ระบบอ่านรายการได้ไม่ครบ ตรวจกับใบเสร็จก่อนบันทึก</p>}
      {items.length === 0 && <p className="py-4 text-center text-sm text-ink/50">ยังไม่มีรายการ — กด "+ เพิ่ม"</p>}
      <ul className="divide-y divide-slate-100 border-t border-slate-100">
        {items.map((it, i) => {
          const cat = categories.find((c) => c.id === (it.category_id ?? it.category_guess));
          const disc = money(it.discount);
          const qty = money(it.qty) ?? 1;
          const shown = disc ? money(it.gross_amount) : money(it.amount);
          return (
            <li key={i}>
              <button type="button" onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-start gap-3 py-3 text-left">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-ink">{it.name || "(ไม่มีชื่อรายการ)"}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-xs text-ink/55">
                    <span
                      className="inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: cat?.color ?? "#CBD5E1" }}
                    />
                    <span className={cat ? "" : "text-amber-600"}>{cat?.name ?? "ยังไม่เลือกหมวด"}</span>
                    {shown !== null && <span>· {fmt(qty).replace(/\.00$/, "")} × {fmt(shown / qty)}</span>}
                  </span>
                  {/* ส่วนลดเป็นข้อความใต้สินค้า ไม่ใช่รายการอีกแถว */}
                  {disc ? (
                    <span className="mt-0.5 block truncate text-xs text-red-700">
                      🏷️ ส่วนลด{it.discount_label ? ` ${it.discount_label}` : ""} −{fmt(disc)}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-bold tabular-nums text-ink">{shown !== null ? fmt(shown) : "—"}</span>
                  {disc ? <span className="block text-xs tabular-nums text-ink/55">จ่าย {fmt(money(it.amount) ?? 0)}</span> : null}
                </span>
              </button>
              {open === i && (
                <ItemEditor
                  item={it}
                  categories={categories}
                  onChange={(fn) => update(i, fn)}
                  onRemove={() => {
                    setItems((xs) => xs.filter((_, j) => j !== i));
                    setOpen(null);
                  }}
                  onDone={() => setOpen(null)}
                />
              )}
            </li>
          );
        })}
      </ul>
      {items.length > 0 && <p className="pt-2 text-center text-xs text-ink/45">แตะรายการเพื่อแก้ไขจำนวน ราคา หมวด หรือเพิ่มส่วนลด</p>}
    </Section>
  );
}

function ItemEditor({
  item: it,
  categories,
  onChange,
  onRemove,
  onDone,
}: {
  item: LineItem;
  categories: { id: string; name: string; icon: string | null; parent_id: string | null }[];
  onChange: (fn: (x: LineItem) => LineItem) => void;
  onRemove: () => void;
  onDone: () => void;
}) {
  const hasDisc = money(it.discount) !== null || it.gross_amount != null;
  const [showDisc, setShowDisc] = useState(Boolean(money(it.discount)));
  const set = (k: keyof LineItem) => (v: string) => onChange((x) => ({ ...x, [k]: v === "" ? null : v }));
  const price = (k: "gross_amount" | "discount" | "amount") => (v: string) => onChange((x) => repriceItem(x, k, v));

  return (
    <div className="mb-3 space-y-3 rounded-2xl border border-slate-200 p-3">
      <MField label="ชื่อรายการ" value={it.name ?? ""} onChange={set("name")} />
      <div className="grid grid-cols-2 gap-3">
        <MField label="จำนวน" type="number" value={it.qty ?? ""} onChange={set("qty")} placeholder="1" align="right" />
        {showDisc || hasDisc ? (
          <MField label="ราคาเต็ม" type="number" value={it.gross_amount ?? ""} onChange={price("gross_amount")} placeholder="0.00" align="right" />
        ) : (
          <MField label="ราคา" type="number" value={it.amount ?? ""} onChange={price("amount")} placeholder="0.00" align="right" />
        )}
      </div>
      <label className="block">
        <span className="mb-1.5 block text-sm text-ink/70">หมวด</span>
        <select
          value={it.category_id ?? it.category_guess ?? ""}
          onChange={(e) => onChange((x) => ({ ...x, category_id: e.target.value || null }))}
          className={inputCls(!(it.category_id ?? it.category_guess))}
        >
          <option value="">เลือกหมวด</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.parent_id ? "　" : ""}
              {c.icon} {c.name}
            </option>
          ))}
        </select>
      </label>

      {showDisc ? (
        <div className="grid grid-cols-[1fr_7rem] gap-3 rounded-xl bg-red-50 p-3">
          <MField label="🏷️ ชื่อส่วนลด" value={it.discount_label ?? ""} onChange={set("discount_label")} placeholder="เช่น โปร 2 ชิ้น" />
          <MField label="ลด (บาท)" type="number" value={it.discount ?? ""} onChange={price("discount")} placeholder="0.00" align="right" />
          <p className="col-span-2 text-right text-sm text-ink/70">
            จ่ายจริง <b className="tabular-nums text-ink">{fmt(money(it.amount) ?? 0)}</b>
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            onChange((x) => (x.gross_amount ? x : { ...x, gross_amount: x.amount }));
            setShowDisc(true);
          }}
          className="text-sm font-bold text-pine"
        >
          + เพิ่มส่วนลดของสินค้านี้
        </button>
      )}

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onRemove} className="btn-ghost flex-1 text-red-700">
          ลบรายการ
        </button>
        <button type="button" onClick={onDone} className="btn flex-1 bg-pine text-white hover:bg-pine-dark">
          เสร็จ
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- ส่วนลดและ VAT

export function DiscountVatSection({
  form,
  onChange,
  billDiscounts,
  setBillDiscounts,
}: {
  form: Form;
  onChange: OnChange;
  billDiscounts: BillDiscount[];
  setBillDiscounts: React.Dispatch<React.SetStateAction<BillDiscount[]>>;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <Section icon={<PercentIcon className="h-5 w-5" />} title="ส่วนลดและ VAT">
      <div className="space-y-4">
        <div>
          <p className="mb-1.5 text-sm text-ink/70">ส่วนลดท้ายบิล / คูปอง / ใช้คะแนน</p>
          {billDiscounts.length === 0 && !adding && <p className="text-sm text-ink/45">ไม่มีส่วนลดท้ายบิล</p>}
          <ul className="space-y-2">
            {billDiscounts.map((b, i) => (
              <li key={i} className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-800">
                <span className="min-w-0 flex-1 truncate">{billDiscountText(b)}</span>
                <span className="tabular-nums">−{fmt(money(b.amount) ?? 0)}</span>
                <button
                  type="button"
                  aria-label="ลบส่วนลดนี้"
                  onClick={() => setBillDiscounts((xs) => xs.filter((_, j) => j !== i))}
                  className="text-red-400 hover:text-red-700"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          {adding ? (
            <div className="mt-2 text-xs">
              <AddBillDiscount
                onCancel={() => setAdding(false)}
                onAdd={(b) => {
                  setBillDiscounts((xs) => [...xs, b]);
                  setAdding(false);
                }}
              />
            </div>
          ) : (
            <button type="button" onClick={() => setAdding(true)} className="mt-2 text-sm font-bold text-pine">
              + เพิ่มส่วนลด / คูปอง / ใช้คะแนน
            </button>
          )}
        </div>

        <div className="border-t border-slate-100 pt-4">
          <p className="mb-1.5 text-sm text-ink/70">VAT</p>
          <Segmented
            label="VAT"
            value={form.vat_mode}
            onChange={(v) => onChange("vat_mode")(v)}
            options={[
              { value: "none", label: "ไม่มี" },
              { value: "included", label: "รวมแล้ว" },
              { value: "excluded", label: "แยก VAT" },
            ]}
          />
          {form.vat_mode !== "none" && (
            <div className="mt-3 grid grid-cols-[6rem_1fr] gap-3">
              <MField label="อัตรา (%)" type="number" value={form.vat_rate} onChange={onChange("vat_rate")} placeholder="7" align="right" />
              <MField label="ยอด VAT (บาท)" type="number" value={form.vat_amount} onChange={onChange("vat_amount")} placeholder="0.00" align="right" />
            </div>
          )}
        </div>

        <MField label="ค่าบริการ (บาท)" type="number" value={form.service_charge} onChange={onChange("service_charge")} placeholder="0.00" align="right" />
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------- การชำระเงิน

const PAY = [
  { value: "cash", label: "เงินสด" },
  { value: "card", label: "บัตร" },
  { value: "promptpay", label: "โอน/QR" },
  { value: "ewallet", label: "e-wallet" },
] as const;

export function PaymentSection({ form, onChange, warn }: { form: Form; onChange: OnChange; warn: (k: string) => boolean }) {
  // AI อาจตอบ transfer — ถือเป็นกลุ่มเดียวกับโอน/QR
  const method = form.payment_method === "transfer" ? "promptpay" : form.payment_method;
  return (
    <Section icon={<CardIcon className="h-5 w-5" />} title="การชำระเงิน">
      <div className="space-y-4">
        <div>
          <p className="mb-1.5 text-sm text-ink/70">ช่องทางจ่าย</p>
          <Segmented
            label="ช่องทางจ่าย"
            value={(PAY.some((p) => p.value === method) ? method : "") as (typeof PAY)[number]["value"]}
            onChange={(v) => onChange("payment_method")(v)}
            options={[...PAY]}
          />
        </div>
        <div className="grid grid-cols-[1fr_7.5rem] gap-3">
          <MField
            label="วันที่บนใบเสร็จ"
            type="date"
            required
            value={form.purchased_at}
            onChange={onChange("purchased_at")}
            warn={warn("issued_at")}
          />
          <MField label="เวลา" type="time" value={form.purchased_time} onChange={onChange("purchased_time")} />
        </div>
        <MField label="หมายเหตุ" value={form.note} onChange={onChange("note")} placeholder="ไม่บังคับ" />
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------- สรุปยอด

export function computeTotals(items: LineItem[], billDiscounts: BillDiscount[], form: Form) {
  const net = items.reduce((s, it) => s + (money(it.amount) ?? 0), 0);
  const itemDisc = items.reduce((s, it) => s + (money(it.discount) ?? 0), 0);
  const billDisc = billDiscounts.reduce((s, b) => s + (money(b.amount) ?? 0), 0);
  const service = money(form.service_charge) ?? 0;
  const afterDisc = net - billDisc + service;
  const rate = money(form.vat_rate) ?? 7;
  let vat = 0;
  if (form.vat_mode === "included") vat = money(form.vat_amount) ?? (afterDisc * rate) / (100 + rate);
  if (form.vat_mode === "excluded") vat = money(form.vat_amount) ?? (afterDisc * rate) / 100;
  const payable = form.vat_mode === "excluded" ? afterDisc + vat : afterDisc;
  const preVat = form.vat_mode === "included" ? afterDisc - vat : afterDisc;
  const hasItems = items.some((it) => money(it.amount) !== null);
  return { gross: net + itemDisc, itemDisc, billDisc, service, vat, rate, preVat, payable, hasItems };
}

export function SummaryCard({
  form,
  onChange,
  items,
  billDiscounts,
  warn,
}: {
  form: Form;
  onChange: OnChange;
  items: LineItem[];
  billDiscounts: BillDiscount[];
  warn: (k: string) => boolean;
}) {
  const t = computeTotals(items, billDiscounts, form);
  const printed = money(form.total);
  const diff = printed === null ? 0 : Math.round((t.payable - printed) * 100) / 100;
  const row = (label: string, value: string, cls = "text-ink") => (
    <div className={`flex justify-between ${cls}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
  return (
    <section className="space-y-2.5 rounded-3xl bg-white p-4 text-sm shadow-sm ring-1 ring-black/5">
      {t.hasItems && (
        <>
          {row("ราคารวมก่อนลด", fmt(t.gross), "text-ink/80")}
          {t.itemDisc > 0 && row("🏷️ ส่วนลดรายการ", `−${fmt(t.itemDisc)}`, "text-red-700")}
          {billDiscounts.map((b, i) => (
            <div key={i} className="flex justify-between gap-3 text-red-700">
              <span className="min-w-0 truncate">{billDiscountText(b)}</span>
              <span className="tabular-nums">−{fmt(money(b.amount) ?? 0)}</span>
            </div>
          ))}
          {t.service > 0 && row("ค่าบริการ", `+${fmt(t.service)}`, "text-ink/80")}
          {form.vat_mode !== "none" && row("ราคาก่อน VAT", fmt(t.preVat), "text-ink/80")}
          {form.vat_mode === "excluded" && row(`VAT ${fmt(t.rate).replace(/\.00$/, "")}%`, `+${fmt(t.vat)}`, "text-ink/80")}
          {form.vat_mode === "included" &&
            row(`VAT ${fmt(t.rate).replace(/\.00$/, "")}% (รวมในราคาแล้ว)`, fmt(t.vat), "text-ink/55")}
          <div className="border-t border-slate-100" />
        </>
      )}
      <MField
        label="ยอดรวมตามใบเสร็จ (บาท)"
        type="number"
        required
        value={form.total}
        onChange={onChange("total")}
        warn={warn("total")}
        align="right"
      />
      {t.hasItems && printed !== null && Math.abs(diff) > 1 && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
          ⚠️ ยอดที่คำนวณจากรายการ ({fmt(t.payable)}) ต่างจากยอดรวมบนใบอยู่ {fmt(Math.abs(diff))} บาท — ตรวจรายการหรือส่วนลดที่อาจตกหล่น
        </p>
      )}
    </section>
  );
}

/** แถบติดล่างจอ: ยอดที่จ่ายจริง + ปุ่มบันทึก (รูปแบบเดียวกับดีไซน์หน้าตรวจสอบ) */
export function StickyTotalBar({
  amount,
  onSave,
  disabled,
  pending,
}: {
  amount: number | null;
  onSave: () => void;
  disabled: boolean;
  pending: boolean;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-xl items-center gap-3 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-ink/60">ยอดสุทธิที่จ่ายจริง</p>
          <p className="text-2xl font-bold tabular-nums text-pine">฿{amount === null ? "—" : fmt(amount)}</p>
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={disabled || pending}
          className="btn h-12 bg-pine px-6 text-base text-white hover:bg-pine-dark"
        >
          {pending ? "กำลังบันทึก…" : "บันทึก"}
        </button>
      </div>
    </div>
  );
}
