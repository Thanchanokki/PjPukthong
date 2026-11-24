import { useMutation } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { type Category, type Transaction, baht, createTransaction } from "../api";
import { labelOf, useCategories } from "../categories";
import { DateSanityNote, SavedOtherMonthDialog } from "../components/DateNotes";
import { ArrowLeftIcon, XIcon } from "../components/icons";
import { EMPTY, buildPayload, today } from "../components/TransactionForm";
import { currentMonth, isoDate, monthOf, shortDate } from "../dates";

/**
 * กรอกรายจ่ายเอง — สำหรับกรณีไม่มีใบเสร็จ เน้นกรอกให้น้อยที่สุด
 *
 * เหลือเฉพาะ ร้าน (ไม่บังคับ) · วันที่ซื้อ · รายการ (ชื่อ จำนวน ราคาต่อชิ้น หมวด) · ช่องทางจ่าย (ไม่บังคับ)
 * ช่องที่มีไว้สำหรับใบเสร็จจริง (สาขา เลขที่เอกสาร เลขผู้เสียภาษี VAT ค่าบริการ) ตัดออก
 * ยอดรวม = ผลรวมของรายการเสมอ ผู้ใช้ไม่ต้องกรอกเอง
 *
 * ประเภทร้านไม่ให้เลือก — คิดจากหมวดของรายการที่ราคารวมมากที่สุด (ดู merchantTypeFor)
 * เพื่อให้งบแบบ "ตามประเภทร้าน" ยังนับรายการที่กรอกเองได้
 */

type Item = { key: number; name: string; qty: number; unit: string; category: string | null };

let nextKey = 1;
const newItem = (): Item => ({ key: nextKey++, name: "", qty: 1, unit: "", category: null });
const amountOf = (it: Item) => (Number(it.unit) > 0 ? it.qty * Number(it.unit) : 0);

/** หมวดหลัก -> ประเภทร้าน ที่ใกล้เคียงที่สุด (หมวดที่ไม่มีในตาราง = ร้านค้าทั่วไป) */
const MERCHANT_OF_CATEGORY: Record<string, string> = {
  food: "restaurant",
  drinks: "restaurant",
  household: "home_hardware",
  personal: "beauty_personal",
  health: "pharmacy",
  transport: "fuel_transport",
  apparel: "department_fashion",
  housing: "bills_services",
};

function merchantTypeFor(items: Item[], categories: Category[]): string {
  const rootOf = (id: string) => categories.find((c) => c.id === id)?.parent_id ?? id;
  const sums = new Map<string, number>();
  for (const it of items) {
    if (!it.category) continue;
    const m = MERCHANT_OF_CATEGORY[rootOf(it.category)] ?? "general_other";
    sums.set(m, (sums.get(m) ?? 0) + amountOf(it));
  }
  return [...sums].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "general_other";
}

/** หมวดที่ขึ้นเป็นการ์ดไอคอนด้านบนของตัวเลือก — ค่าใช้จ่ายประจำวันของนักศึกษา */
const FREQUENT = ["food", "drinks", "education", "transport"];

const PAY = [
  { value: "cash", label: "เงินสด" },
  { value: "promptpay", label: "โอน/QR" },
  { value: "card", label: "บัตร" },
] as const;

const yesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return isoDate(d);
};

export default function ManualPage() {
  const navigate = useNavigate();
  const { data: categories = [] } = useCategories();

  const [shop, setShop] = useState("");
  const [date, setDate] = useState(today);
  const [pickDate, setPickDate] = useState(false);
  const [items, setItems] = useState<Item[]>(() => [newItem()]);
  /** รายการที่กำลังแก้ — รายการอื่นแสดงเป็นแถวย่อ */
  const [editing, setEditing] = useState<number | null>(items[0].key);
  /** รายการที่กำลังเลือกหมวด (เปิดแผ่นล่างจอ) */
  const [picking, setPicking] = useState<number | null>(null);
  const [pay, setPay] = useState("");
  const [savedCount, setSavedCount] = useState(0);
  const [savedOther, setSavedOther] = useState<Transaction | null>(null);

  const filled = items.filter((it) => it.name.trim() !== "" || amountOf(it) > 0);
  const total = filled.reduce((s, it) => s + amountOf(it), 0);
  const missing =
    filled.length === 0
      ? "เพิ่มรายการก่อน"
      : filled.some((it) => amountOf(it) <= 0)
        ? "ใส่ราคาให้ครบทุกรายการ"
        : filled.some((it) => !it.category)
          ? "เลือกหมวดให้ครบทุกรายการ"
          : !date
            ? "เลือกวันที่ซื้อ"
            : null;

  const update = (key: number, patch: Partial<Item>) =>
    setItems((xs) => xs.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  const removeItem = (key: number) => {
    setItems((xs) => (xs.length === 1 ? [newItem()] : xs.filter((it) => it.key !== key)));
    if (editing === key) setEditing(null);
  };
  const addItem = () => {
    const it = newItem();
    setItems((xs) => [...xs, it]);
    setEditing(it.key);
  };

  const save = useMutation({
    mutationFn: (andNew: boolean) => {
      const payload = buildPayload(
        {
          ...EMPTY,
          merchant_name: shop,
          merchant_type: merchantTypeFor(filled, categories),
          purchased_at: date,
          total: total.toFixed(2),
          payment_method: pay,
          vat_mode: "none",
        },
        filled.map((it) => ({
          name: it.name.trim() || null,
          qty: String(it.qty),
          unit_price: Number(it.unit).toFixed(2),
          amount: amountOf(it).toFixed(2),
          flag: null,
          category_id: it.category,
        })),
        null,
      );
      return createTransaction(payload).then((tx) => ({ tx, andNew }));
    },
    onSuccess: ({ tx, andNew }) => {
      if (andNew) {
        // กรอกต่อ: คงวันที่ไว้ เพราะมักกรอกหลายใบของวันเดียวกัน
        setSavedCount((n) => n + 1);
        setShop("");
        const it = newItem();
        setItems([it]);
        setEditing(it.key);
        setPay("");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      // วันที่คนละเดือนกับเดือนนี้: แจ้งก่อนว่ายอดไปอยู่เดือนไหน ไม่งั้นดูเหมือนข้อมูลหาย
      if (monthOf(tx.purchased_at) === currentMonth()) navigate(`/dashboard?month=${monthOf(tx.purchased_at)}`);
      else setSavedOther(tx);
    },
  });

  const pickingItem = items.find((it) => it.key === picking);
  const catName = (id: string | null) => {
    const c = categories.find((x) => x.id === id);
    return c ? c.name : null;
  };
  const isToday = date === today();
  const isYesterday = date === yesterday();

  return (
    <div className="mx-auto -mt-6 max-w-xl pb-48 text-ink">
      {savedOther && (
        <SavedOtherMonthDialog
          purchasedAt={savedOther.purchased_at}
          merchant={savedOther.merchant_name}
          total={savedOther.total}
        />
      )}
      {pickingItem && (
        <CategorySheet
          item={pickingItem}
          categories={categories}
          onPick={(id) => {
            update(pickingItem.key, { category: id });
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
        />
      )}

      <div className="-mx-4 bg-ink px-4 py-4 text-paper sm:-mx-6 sm:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="ย้อนกลับ"
            className="-ml-1 grid h-11 w-11 place-items-center rounded-full transition hover:bg-white/10"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </button>
          <h1 className="text-base font-semibold">กรอกรายจ่ายเอง</h1>
        </div>
      </div>

      <div className="space-y-5 pt-5">
        {savedCount > 0 && (
          <p role="status" className="rounded-lg border border-ledger/30 bg-ledger/10 px-3 py-2.5 text-sm text-ledger">
            บันทึกแล้ว {savedCount} ใบ — กรอกใบถัดไปได้เลย
          </p>
        )}

        <div>
          <label htmlFor="manual-shop" className="mb-1.5 block text-sm font-semibold text-ink/80">
            ร้าน <span className="font-normal text-ink/60">(ไม่บังคับ)</span>
          </label>
          <input
            id="manual-shop"
            value={shop}
            onChange={(e) => setShop(e.target.value)}
            placeholder="เช่น 7-Eleven หน้าหอ"
            className="h-12 w-full rounded-xl border border-kraft bg-white px-3.5 text-[15px] focus:border-pine focus:outline-none focus:ring-1 focus:ring-pine"
          />
        </div>

        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold text-ink/80">วันที่ซื้อ</legend>
          <div className="flex flex-wrap gap-2">
            <Chip on={isToday && !pickDate} onClick={() => { setDate(today()); setPickDate(false); }}>วันนี้</Chip>
            <Chip on={isYesterday && !pickDate} onClick={() => { setDate(yesterday()); setPickDate(false); }}>เมื่อวาน</Chip>
            <Chip on={pickDate || (!isToday && !isYesterday)} onClick={() => setPickDate(true)}>
              {!isToday && !isYesterday && date ? shortDate(date) : "เลือกวัน"}
            </Chip>
          </div>
          {(pickDate || (!isToday && !isYesterday)) && (
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label="วันที่ซื้อ"
              className="mt-2 h-12 w-full rounded-xl border border-kraft bg-white px-3.5 focus:border-pine focus:outline-none focus:ring-1 focus:ring-pine"
            />
          )}
          <DateSanityNote date={date} onFix={setDate} />
        </fieldset>

        <section className="overflow-hidden rounded-2xl border border-kraft bg-white">
          <h2 className="border-b border-kraft/70 px-4 py-3 text-[15px] font-bold">รายการ ({filled.length})</h2>
          <ul className="divide-y divide-kraft/70">
            {items.map((it, i) =>
              editing === it.key ? (
                <ItemEditor
                  key={it.key}
                  item={it}
                  index={i}
                  categoryName={catName(it.category)}
                  onChange={(patch) => update(it.key, patch)}
                  onPickCategory={() => setPicking(it.key)}
                  onRemove={() => removeItem(it.key)}
                  onDone={() => setEditing(null)}
                />
              ) : (
                <li key={it.key} className="flex items-center gap-2 px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() => setEditing(it.key)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate text-[15px]">
                      {it.name || "(ไม่มีชื่อ)"}{" "}
                      <span className="text-[13px] text-ink/60">
                        {it.qty} × ฿{baht(it.unit || 0)}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPicking(it.key)}
                    className={`min-h-[32px] shrink-0 rounded-full px-2.5 text-xs font-medium ${
                      it.category ? "bg-kraft/60" : "border border-dashed border-stamp text-stamp"
                    }`}
                  >
                    {catName(it.category) ?? "เลือกหมวด"} ▾
                  </button>
                  <span className="w-20 shrink-0 text-right font-mono font-bold tabular-nums">฿{baht(amountOf(it))}</span>
                  <button
                    type="button"
                    onClick={() => removeItem(it.key)}
                    aria-label={`ลบ ${it.name || "รายการนี้"}`}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink/55 hover:bg-stamp/10 hover:text-stamp"
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                </li>
              ),
            )}
          </ul>
          <div className="p-3">
            <button
              type="button"
              onClick={addItem}
              className="min-h-[44px] w-full rounded-xl border border-dashed border-kraft text-sm font-semibold text-pine hover:border-pine/50"
            >
              + เพิ่มรายการ
            </button>
          </div>
        </section>

        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold text-ink/80">
            ช่องทางจ่าย <span className="font-normal text-ink/60">(ไม่บังคับ)</span>
          </legend>
          <div className="grid grid-cols-3 gap-2">
            {PAY.map((p) => (
              <Chip key={p.value} on={pay === p.value} onClick={() => setPay(pay === p.value ? "" : p.value)} block>
                {p.label}
              </Chip>
            ))}
          </div>
        </fieldset>

        {save.isError && (
          <div className="rounded-lg border border-stamp/40 bg-stamp/5 p-3 text-sm text-stamp">
            {(save.error as Error).message}
          </div>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-kraft bg-paper/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto max-w-xl space-y-1.5">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-ink/65">ยอดรวม · {filled.length} รายการ</span>
            <span className="font-mono text-2xl font-bold tabular-nums">฿{baht(total)}</span>
          </div>
          <button
            type="button"
            onClick={() => save.mutate(false)}
            disabled={missing !== null || save.isPending}
            className="min-h-[52px] w-full rounded-xl bg-stamp text-base font-semibold text-white transition hover:bg-stamp/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {save.isPending ? "กำลังบันทึก…" : (missing ?? "บันทึกรายการ")}
          </button>
          <button
            type="button"
            onClick={() => save.mutate(true)}
            disabled={missing !== null || save.isPending}
            className="min-h-[40px] w-full text-sm font-semibold text-pine disabled:opacity-40"
          >
            บันทึกแล้วเพิ่มอีกใบ
          </button>
        </div>
      </div>
    </div>
  );
}

function Chip({
  on,
  onClick,
  block,
  children,
}: {
  on: boolean;
  onClick: () => void;
  block?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`min-h-[44px] px-4 text-sm transition ${block ? "rounded-xl" : "rounded-full"} ${
        on ? "border-2 border-pine bg-mist font-bold text-pine-dark" : "border border-kraft bg-white"
      }`}
    >
      {children}
    </button>
  );
}

function ItemEditor({
  item,
  index,
  categoryName,
  onChange,
  onPickCategory,
  onRemove,
  onDone,
}: {
  item: Item;
  index: number;
  categoryName: string | null;
  onChange: (patch: Partial<Item>) => void;
  onPickCategory: () => void;
  onRemove: () => void;
  onDone: () => void;
}) {
  const id = `item-${item.key}`;
  return (
    <li className="space-y-2.5 bg-paper/60 px-4 py-3">
      <div>
        <label htmlFor={`${id}-name`} className="mb-1 block text-xs text-ink/65">
          ชื่อรายการ {index + 1}
        </label>
        <input
          id={`${id}-name`}
          autoFocus
          value={item.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="เช่น ข้าวกล่อง"
          className="h-11 w-full rounded-lg border border-kraft bg-white px-3 text-[15px] focus:border-pine focus:outline-none focus:ring-1 focus:ring-pine"
        />
      </div>
      <div className="flex items-end gap-2">
        <div>
          <span id={`${id}-qty`} className="mb-1 block text-xs text-ink/65">จำนวน</span>
          <div role="group" aria-labelledby={`${id}-qty`} className="flex h-11 items-center rounded-lg border border-kraft bg-white">
            <button
              type="button"
              onClick={() => onChange({ qty: Math.max(1, item.qty - 1) })}
              aria-label="ลดจำนวน"
              className="h-full w-10 text-xl"
            >
              −
            </button>
            <input
              inputMode="numeric"
              value={item.qty}
              onChange={(e) => {
                const n = Math.floor(Number(e.target.value));
                onChange({ qty: Number.isFinite(n) && n > 0 ? n : 1 });
              }}
              aria-label="จำนวน"
              className="w-10 bg-transparent text-center font-mono font-bold tabular-nums outline-none"
            />
            <button
              type="button"
              onClick={() => onChange({ qty: item.qty + 1 })}
              aria-label="เพิ่มจำนวน"
              className="h-full w-10 text-xl"
            >
              +
            </button>
          </div>
        </div>
        <span className="pb-3 text-ink/60" aria-hidden="true">×</span>
        <div className="min-w-0 flex-1">
          <label htmlFor={`${id}-unit`} className="mb-1 block text-xs text-ink/65">ราคาต่อชิ้น</label>
          <input
            id={`${id}-unit`}
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={item.unit}
            onChange={(e) => onChange({ unit: e.target.value })}
            placeholder="0"
            className="h-11 w-full rounded-lg border border-kraft bg-white px-3 text-right font-mono tabular-nums focus:border-pine focus:outline-none focus:ring-1 focus:ring-pine"
          />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onPickCategory}
          className={`min-h-[36px] rounded-full px-3 text-sm font-semibold ${
            categoryName ? "bg-kraft/60" : "border border-dashed border-stamp text-stamp"
          }`}
        >
          {categoryName ?? "เลือกหมวด"} ▾
        </button>
        <span className="text-sm text-ink/65">
          รวม <span className="font-mono font-bold tabular-nums text-ink">฿{baht(amountOf(item))}</span>
        </span>
      </div>
      <div className="flex justify-between">
        <button type="button" onClick={onRemove} className="min-h-[36px] px-1 text-sm text-stamp">
          ลบรายการ
        </button>
        <button type="button" onClick={onDone} className="min-h-[36px] rounded-lg px-3 text-sm font-semibold text-pine hover:bg-mist">
          เสร็จ
        </button>
      </div>
    </li>
  );
}

function CategorySheet({
  item,
  categories,
  onPick,
  onClose,
}: {
  item: Item;
  categories: Category[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const frequent = FREQUENT.map((id) => categories.find((c) => c.id === id)).filter((c): c is Category => !!c);
  const rest = categories.filter((c) => !FREQUENT.includes(c.id));
  const tile = (selected: boolean) =>
    selected ? "border-2 border-stamp bg-stamp/10 font-bold text-stamp" : "border border-kraft bg-white";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="category-sheet-title"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full max-w-md space-y-3 overflow-y-auto rounded-t-2xl bg-paper px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 text-ink sm:rounded-2xl"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 id="category-sheet-title" className="text-lg font-bold">เลือกหมวด</h2>
            <p className="text-sm text-ink/65">
              {item.name || "รายการนี้"} · {item.qty} × ฿{baht(item.unit || 0)} · ฿{baht(amountOf(item))}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="ปิด" className="grid h-11 w-11 place-items-center rounded-full text-ink/60 hover:bg-ink/5">
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        {frequent.length > 0 && (
          <>
            <p className="text-xs font-semibold text-ink/65">ใช้บ่อย</p>
            <div className="grid grid-cols-4 gap-2">
              {frequent.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onPick(c.id)}
                  className={`flex min-h-[68px] flex-col items-center justify-center gap-1 rounded-xl text-xs ${tile(item.category === c.id)}`}
                >
                  <span className="text-xl leading-none" aria-hidden="true">{c.icon}</span>
                  {c.name}
                </button>
              ))}
            </div>
          </>
        )}

        <p className="pt-1 text-xs font-semibold text-ink/65">ทั้งหมด</p>
        <div className="grid grid-cols-2 gap-2">
          {rest.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onPick(c.id)}
              className={`min-h-[44px] rounded-xl px-3 text-left text-sm ${tile(item.category === c.id)}`}
            >
              {labelOf(c)}
            </button>
          ))}
          <Link
            to="/categories"
            className="flex min-h-[44px] items-center rounded-xl border border-dashed border-kraft px-3 text-sm font-semibold text-pine"
          >
            + สร้างหมวดเอง
          </Link>
        </div>
      </div>
    </div>
  );
}
