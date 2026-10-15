import { useEffect, useRef } from "react";

import { baht } from "../api";

export type BudgetItem = {
  key: string;
  name: string;
  date: string;
  merchant: string | null;
  amount: number;
  /** ส่วนลดของรายการนี้ (บวก) — มีค่าเมื่อซื้อในราคาลด */
  discount?: number | null;
  discountLabel?: string | null;
};

const thaiDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short" });

/**
 * ป๊อปอัพรายการสินค้าที่สแกนมาในงบหมวดหนึ่ง — ชื่อรายการ / วันที่ · ร้าน / ราคา
 *
 * ไม่มีรูปใบเสร็จโดยตั้งใจ ให้อ่านง่ายบนมือถือ อยากดูรูปไปที่หน้ารายการได้
 */
export function BudgetItemsDialog({
  title,
  items,
  spent,
  loading,
  onClose,
  onEditLimit,
}: {
  title: string;
  items: BudgetItem[];
  /** ยอดใช้ไปของหมวดนี้ตามหน้างบ — ใช้บอกส่วนต่างจาก VAT/ส่วนลดท้ายบิล */
  spent: number;
  loading: boolean;
  onClose: () => void;
  onEditLimit: () => void;
}) {
  const closeBtn = useRef<HTMLButtonElement>(null);
  const itemsSum = items.reduce((s, i) => s + i.amount, 0);
  const diff = Math.round((spent - itemsSum) * 100) / 100;

  useEffect(() => {
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    // กันหน้าหลังเลื่อนตามตอนเลื่อนรายการในป๊อปอัพบนมือถือ
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="budget-items-title"
        className="flex max-h-[85vh] w-full max-w-md flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-kraft px-5 py-4">
          <h2 id="budget-items-title" className="min-w-0 flex-1 truncate text-base font-semibold text-ink">
            {title}
          </h2>
          <button
            ref={closeBtn}
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="grid h-8 w-8 place-items-center rounded-full text-ink/50 hover:bg-ink/5"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5">
          {loading && <p className="py-6 text-center text-sm text-ink/50">กำลังโหลด…</p>}
          {!loading && items.length === 0 && (
            <p className="py-6 text-center text-sm text-ink/50">ยังไม่มีรายการในหมวดนี้</p>
          )}
          <ul className="divide-y divide-kraft/70">
            {items.map((it) => (
              <li key={it.key} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{it.name}</p>
                  <p className="mt-0.5 truncate text-xs text-ink/50">
                    {thaiDate(it.date)}
                    {it.merchant && ` · ${it.merchant}`}
                  </p>
                  {it.discount ? (
                    <p className="text-xs text-red-700">
                      🏷️ ส่วนลด{it.discountLabel ? ` ${it.discountLabel}` : ""} −{baht(it.discount)} (ราคาเต็ม{" "}
                      {baht(it.amount + it.discount)})
                    </p>
                  ) : null}
                </div>
                <span className="shrink-0 font-mono text-sm tabular-nums">{baht(it.amount)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-3 border-t border-kraft px-5 py-4">
          <div className="flex justify-between text-sm">
            <span className="text-ink/60">รวม {items.length} รายการ</span>
            <span className="font-mono font-semibold tabular-nums">฿{baht(itemsSum)}</span>
          </div>
          {!loading && diff !== 0 && (
            <p className="text-xs text-ink/45">
              ยอดใช้ไปในงบ ฿{baht(spent)} ต่างจากผลรวมรายการ ฿{baht(diff)} — เป็น VAT ส่วนลด
              หรือค่าบริการท้ายบิลที่ไม่ได้อยู่ในรายการสินค้า
            </p>
          )}
          <button type="button" onClick={onEditLimit} className="btn-ghost w-full">
            แก้วงเงินของหมวดนี้
          </button>
        </div>
      </div>
    </div>
  );
}
