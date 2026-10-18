/**
 * ป๊อปอัพเตือนงบใกล้หมด/เกินงบ — เด้งครั้งเดียวหลังเข้าสู่ระบบ
 *
 * ดูงบของเดือนนี้ทั้งสองแกน (ตามประเภทร้าน + ตามหมวดสินค้า) เพราะผู้ใช้ตั้งงบแกนไหนไว้ก็ได้
 * เกณฑ์เดียวกับหน้างบประมาณ: ใช้ถึง 80% = ใกล้เกินงบ, เกินวงเงิน = เกินงบแล้ว
 *
 * "ครั้งเดียว" = ต่อการเข้าสู่ระบบหนึ่งครั้งต่อเดือน — จำไว้ใน sessionStorage จึงไม่เด้งซ้ำ
 * ทุกครั้งที่เปลี่ยนหน้าหรือรีเฟรช ออกจากระบบแล้วเข้าใหม่จะเห็นอีกรอบ (auth.tsx ล้างค่าให้)
 * แถบเตือนในหน้าหลักยังอยู่ ปิดป๊อปอัพไปแล้วก็ยังเห็นสถานะงบได้
 */
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { baht } from "../api";
import { useAuth } from "../auth";
import { ReceiptIcon, StoreIcon, ListLinesIcon, WarningIcon } from "./icons";
import { BUDGET_ALERT_KEY, type BudgetAxis, type BudgetLine, fetchBudget } from "../budget";

/** เวลาท้องถิ่น — toISOString() เป็น UTC ช่วงตี 0–7 โมงไทยจะได้เดือนผิด */
const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const AXIS_LABEL: Record<BudgetAxis, string> = { merchant: "ตามประเภทร้าน", item: "ตามหมวดสินค้า" };

type Alert = BudgetLine & { axis: BudgetAxis; ratio: number };

/**
 * ไอคอนเส้นในกล่องของแต่ละหมวด — บิล/ค่าบริการใช้รูปใบเสร็จ, งบตามประเภทร้านใช้รูปร้าน,
 * งบตามหมวดสินค้าใช้รูปรายการ (ไอคอนอีโมจิของหมวดไม่เข้ากับดีไซน์แบบเส้นของป๊อปอัพ)
 */
const iconOf = (a: Alert) =>
  a.category_id === "bills_services" || a.category_id === "housing"
    ? ReceiptIcon
    : a.axis === "merchant"
      ? StoreIcon
      : ListLinesIcon;

/** หมวดที่ใช้ถึง 80% ขึ้นไป เรียงจากแย่สุด */
function alertsOf(lines: BudgetLine[] | undefined, axis: BudgetAxis): Alert[] {
  return (lines ?? [])
    .filter((l) => l.limit !== null && Number(l.limit) > 0)
    .map((l) => ({ ...l, axis, ratio: Number(l.spent) / Number(l.limit) }))
    .filter((l) => l.ratio >= 0.8);
}

const seen = (key: string) => {
  try {
    return sessionStorage.getItem(key) !== null;
  } catch {
    return false;
  }
};
const markSeen = (key: string) => {
  try {
    sessionStorage.setItem(key, "1");
  } catch {
    // เบราว์เซอร์ปิด storage — เด้งซ้ำได้ ไม่ร้ายแรง
  }
};

export function BudgetAlertDialog() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const month = thisMonth();
  const key = `${BUDGET_ALERT_KEY}${user?.id ?? ""}:${month}`;
  const [open, setOpen] = useState(() => Boolean(user) && !seen(key));

  // key เดียวกับหน้างบ จึงได้จาก cache และอัปเดตพร้อมกันเมื่อแก้งบ
  const merchant = useQuery({
    queryKey: ["budget", month, "merchant"],
    queryFn: () => fetchBudget(month, "merchant"),
    enabled: open,
  });
  const item = useQuery({
    queryKey: ["budget", month, "item"],
    queryFn: () => fetchBudget(month, "item"),
    enabled: open,
  });

  const alerts = [...alertsOf(merchant.data?.lines, "merchant"), ...alertsOf(item.data?.lines, "item")].sort(
    (a, b) => b.ratio - a.ratio,
  );
  const ready = merchant.isFetched && item.isFetched;
  const show = open && ready && alerts.length > 0;

  // จำว่าเห็นแล้วตั้งแต่โหลดเสร็จ — ไม่มีอะไรต้องเตือนก็ไม่ต้องเช็คซ้ำในรอบนี้
  useEffect(() => {
    if (open && ready) markSeen(key);
  }, [open, ready, key]);

  const close = () => setOpen(false);
  const primary = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!show) return;
    primary.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [show]);

  if (!show) return null;

  const anyOver = alerts.some((a) => a.ratio > 1);
  const showAxis = new Set(alerts.map((a) => a.axis)).size > 1;
  const goToBudget = () => {
    close();
    navigate(`/budget?month=${month}&by=${alerts[0].axis}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={close}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="budget-alert-title"
        className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <span
          className={`grid h-12 w-12 place-items-center rounded-2xl ${anyOver ? "bg-stamp/10 text-stamp" : "bg-amber-100 text-amber-700"}`}
          aria-hidden="true"
        >
          <WarningIcon className="h-6 w-6" />
        </span>
        <h2 id="budget-alert-title" className="mt-4 text-2xl font-bold text-ink">
          {anyOver ? "ใช้เงินเกินงบแล้ว" : "ใกล้ใช้เงินเกินงบแล้ว"}
        </h2>
        <p className="mt-1 text-sm text-ink/60">งบเดือนนี้มี {alerts.length} หมวดที่ต้องระวัง</p>

        <ul className="mt-5 max-h-72 space-y-3 overflow-y-auto">
          {alerts.map((a) => {
            const over = a.ratio > 1;
            const diff = Math.abs(Number(a.limit) - Number(a.spent));
            const Icon = iconOf(a);
            return (
              <li key={`${a.axis}:${a.category_id}`} className="rounded-2xl border border-kraft p-4">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-mist text-pine" aria-hidden="true">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate font-semibold text-ink">{a.category}</span>
                  <span className={`shrink-0 font-semibold ${over ? "text-stamp" : "text-amber-700"}`}>
                    {over ? "เกิน" : "เหลือ"} ฿{baht(diff)}
                  </span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink/10">
                  <div
                    className={`h-full rounded-full ${over ? "bg-stamp" : "bg-amber-500"}`}
                    style={{ width: `${Math.min(a.ratio, 1) * 100}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-ink/60">
                  ใช้ไป ฿{baht(a.spent)} จากงบ ฿{baht(a.limit)} ({Math.round(a.ratio * 100)}%)
                  {showAxis && ` · ${AXIS_LABEL[a.axis]}`}
                </p>
              </li>
            );
          })}
        </ul>

        <div className="mt-6 space-y-3">
          <button
            ref={primary}
            onClick={goToBudget}
            className="w-full rounded-2xl bg-pine py-3.5 font-semibold text-white hover:bg-pine-dark focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-pine/20"
          >
            ดูงบประมาณ
          </button>
          <button
            onClick={close}
            className="w-full rounded-2xl border border-kraft bg-white py-3.5 font-semibold text-ink hover:bg-ink/5"
          >
            รับทราบ
          </button>
        </div>
      </div>
    </div>
  );
}
