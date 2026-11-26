import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { type Transaction, fetchMonthly } from "../api";
import {
  AXIS_LABEL,
  type BudgetAxis,
  type BudgetLine,
  copyBudget,
  fetchBudget,
  removeBudgetLimit,
  budgetName,
  saveBudgetLimit,
} from "../budget";
import { BudgetIcon } from "../components/BudgetIcon";
import { FALLBACK, labelOf } from "../categories";
import { type BudgetItem, BudgetItemsDialog } from "../components/BudgetItemsDialog";
import { PlusIcon } from "../components/icons";

/**
 * หน้างบประมาณ — มีงบสองแบบ "หมวดของ" กับ "ประเภทร้าน" (แท็บ + แผ่นอธิบาย)
 *
 * - การ์ดสรุปสีเข้ม: เหลือในงบ / ใช้ไปจากงบ / วันละเท่าไร และบรรทัด "ใช้จ่ายทั้งเดือน · นอกงบ"
 *   ที่ยอดใช้จ่ายทั้งเดือนเท่ากันทั้งสองแท็บ ผู้ใช้จะได้เห็นว่าต่างกันแค่ส่วนที่อยู่ในงบ
 * - แถวงบ: ไอคอน + ชื่อสั้น + "เหลือ" ตัวหนา แตะแถว = ดูรายการ, ปุ่มดินสอ = แก้/ลบวงเงิน
 * - รายจ่ายที่ยังไม่มีงบรวมเป็นกล่องเดียว มีปุ่มลัดไปหน้าตั้งงบของหมวดนั้น
 * - ตัวเลขไม่มีทศนิยม
 */

// ---------------------------------------------------------------- เดือน

/** เวลาท้องถิ่น — toISOString() เป็น UTC ช่วงตี 0–7 โมงไทยจะได้เดือนผิด */
const toMonth = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

const shiftMonth = (month: string, delta: number) => {
  const [y, m] = month.split("-").map(Number);
  return toMonth(new Date(y, m - 1 + delta, 1));
};

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

const monthLabel = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return `${THAI_MONTHS[m - 1]} ${y + 543}`;
};

/** จำนวนวันที่เหลือในเดือน นับวันนี้ด้วย — เดือนที่ผ่านไปแล้ว = 0 */
function daysLeftIn(month: string) {
  const now = new Date();
  const current = toMonth(now);
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  if (month < current) return 0;
  if (month > current) return daysInMonth;
  return daysInMonth - now.getDate() + 1;
}

// ---------------------------------------------------------------- สถานะงบ

type Tone = "ok" | "near" | "over";

/** ใช้ถึง 80% ขึ้นไปถือว่าใกล้เต็ม */
const toneOf = (spent: number, limit: number): Tone =>
  spent > limit ? "over" : spent >= limit * 0.8 ? "near" : "ok";

const TONE: Record<Tone, { bar: string; text: string }> = {
  ok: { bar: "bg-ledger", text: "text-ledger" },
  near: { bar: "bg-amber-500", text: "text-amber-700" },
  over: { bar: "bg-stamp", text: "text-stamp" },
};

// ---------------------------------------------------------------- page

/** แท็บที่เปิดล่าสุด — กลับมาหน้างบอีกครั้งจะอยู่แท็บเดิม (ค่าเริ่มต้น: ประเภทร้าน ตามที่ใช้มาตลอด) */
const AXIS_KEY = "budget-axis";
const lastAxis = (): BudgetAxis => {
  try {
    return localStorage.getItem(AXIS_KEY) === "item" ? "item" : "merchant";
  } catch {
    return "merchant";
  }
};

/** จำนวนเงินไม่มีทศนิยม — หน้างบดูภาพรวม ทศนิยมทำให้อ่านยากโดยไม่ได้ข้อมูลเพิ่ม */
const thb = (n: number) => `฿${Math.round(n).toLocaleString("th-TH")}`;

export default function BudgetPage() {
  const [params, setParams] = useSearchParams();
  const month = params.get("month") ?? toMonth(new Date());
  /** แกนของงบ — เก็บใน URL ให้ refresh แล้วอยู่แท็บเดิม ไม่มีใน URL = แท็บที่เปิดล่าสุด */
  const byParam = params.get("by");
  const axis: BudgetAxis = byParam === "item" || byParam === "merchant" ? byParam : lastAxis();
  const qc = useQueryClient();
  /** หมวดที่กำลังแก้วงเงินอยู่ — เปิดได้ทีละหมวด */
  const [editing, setEditing] = useState<string | null>(null);
  /** หมวดที่เปิดป๊อปอัพดูรายการสินค้าอยู่ */
  const [detail, setDetail] = useState<BudgetLine | null>(null);
  const [help, setHelp] = useState(false);
  // รายการของเดือนนี้ — key เดียวกับหน้ารายงาน/หน้าหลัก จึงมักได้จาก cache ทันที
  // โหลดเฉพาะตอนเปิดป๊อปอัพ ไม่ต้องดึงทั้งเดือนทุกครั้งที่เข้าหน้างบ
  const monthly = useQuery({
    queryKey: ["monthly", month, "purchased"],
    queryFn: () => fetchMonthly(month, "purchased"),
    enabled: detail !== null,
  });

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["budget", month, axis],
    queryFn: () => fetchBudget(month, axis),
  });
  // ใช้ตัดสินว่าจะโชว์ปุ่ม "ใช้งบเดือนก่อน" ไหม — ถ้าเดือนก่อนไม่มีงบ กดไปก็ได้แค่ error
  const prevMonth = shiftMonth(month, -1);
  const prev = useQuery({
    queryKey: ["budget", prevMonth, axis],
    queryFn: () => fetchBudget(prevMonth, axis),
  });
  const canCopy = (prev.data?.lines ?? []).some((l) => l.limit !== null);

  const done = () => {
    setEditing(null);
    return qc.invalidateQueries({ queryKey: ["budget", month] });
  };

  const save = useMutation({
    mutationFn: (v: { categoryId: string; limit: number }) =>
      saveBudgetLimit(month, axis, v.categoryId, v.limit),
    // error เก่าของปุ่มคัดลอกค้างอยู่จะดูเหมือนการตั้งงบล้มเหลวไปด้วย — ล้างทิ้งตอนเริ่มบันทึก
    onMutate: () => copy.reset(),
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: (categoryId: string) => removeBudgetLimit(month, axis, categoryId),
    onSuccess: done,
  });
  const copy = useMutation({
    mutationFn: () => copyBudget(axis, shiftMonth(month, -1), month),
    onSuccess: done,
  });

  const goTo = (next: string) => {
    setEditing(null);
    setParams({ month: next, by: axis });
  };
  const switchAxis = (next: BudgetAxis) => {
    setEditing(null);
    try {
      localStorage.setItem(AXIS_KEY, next);
    } catch {
      // storage ปิดอยู่ — แค่จำแท็บไม่ได้
    }
    setParams({ month, by: next });
  };

  const busy = save.isPending || remove.isPending || copy.isPending;
  const mutationError = (save.error ?? remove.error ?? copy.error) as Error | null;

  const lines = data?.lines ?? [];
  const budgeted = lines
    .filter((l) => l.limit !== null)
    .sort((a, b) => ratio(b) - ratio(a));
  const unbudgeted = lines
    .filter((l) => l.limit === null && Number(l.spent) > 0)
    .sort((a, b) => Number(b.spent) - Number(a.spent));
  const options = data?.options ?? [];

  const totalLimit = sum(budgeted, "limit");
  const totalSpent = sum(budgeted, "spent");
  const outsideSpent = sum(unbudgeted, "spent");
  const nearCount = budgeted.filter((l) => toneOf(Number(l.spent), Number(l.limit)) !== "ok").length;
  const setupLink = (category?: string) =>
    `/budget/new?month=${month}&by=${axis}${category ? `&category=${category}` : ""}`;

  return (
    <div className="mx-auto max-w-xl space-y-4 text-ink">
      <header className="flex items-center gap-2">
        <h1 className="flex-1 text-2xl font-semibold">งบประมาณ</h1>
        <MonthSwitcher month={month} onChange={goTo} />
      </header>

      <div>
        <AxisTabs value={axis} onChange={switchAxis} />
        <button
          type="button"
          onClick={() => setHelp(true)}
          className="mt-1.5 inline-flex min-h-[32px] items-center gap-1 text-xs font-semibold text-pine hover:text-pine-dark"
        >
          <span aria-hidden="true">ⓘ</span> สองแบบต่างกันยังไง?
        </button>
      </div>

      {help && <AxisHelpSheet onClose={() => setHelp(false)} />}

      {detail && (
        <BudgetItemsDialog
          title={labelOf({ name: budgetName(axis, detail.category_id, detail.category), icon: detail.icon })}
          items={itemsOf(monthly.data?.transactions ?? [], axis, detail)}
          spent={Number(detail.spent)}
          loading={monthly.isPending}
          onClose={() => setDetail(null)}
          onEditLimit={() => {
            setEditing(detail.category_id);
            setDetail(null);
          }}
        />
      )}

      {isPending && <p className="text-sm text-ink/50">กำลังโหลด…</p>}
      {isError && <ErrorBox message={(error as Error).message} />}

      {data && (
        <>
          {budgeted.length > 0 ? (
            <SummaryCard
              limit={totalLimit}
              spent={totalSpent}
              outside={outsideSpent}
              daysLeft={daysLeftIn(month)}
            />
          ) : (
            <EmptyBudget
              month={month}
              axis={axis}
              total={outsideSpent}
              busy={copy.isPending}
              onCopy={canCopy ? () => copy.mutate() : null}
            />
          )}

          {mutationError && <ErrorBox message={mutationError.message} />}

          {budgeted.length > 0 && (
            <section className="overflow-hidden rounded-2xl border border-kraft bg-white">
              <div className="flex items-baseline justify-between px-4 pb-1 pt-3">
                <h2 className="font-semibold">งบที่ตั้งไว้ ({budgeted.length})</h2>
                {nearCount > 0 && (
                  <span className="text-xs font-semibold text-amber-700">{nearCount} หมวดใกล้ครบ</span>
                )}
              </div>
              <ul className="divide-y divide-kraft/60">
                {budgeted.map((line) => (
                  <BudgetRow
                    key={line.category_id}
                    axis={axis}
                    line={line}
                    open={editing === line.category_id}
                    busy={busy}
                    onDetail={() => setDetail(line)}
                    onEdit={() => setEditing(editing === line.category_id ? null : line.category_id)}
                    onSave={(limit) => save.mutate({ categoryId: line.category_id, limit })}
                    onRemove={() => remove.mutate(line.category_id)}
                  />
                ))}
              </ul>
            </section>
          )}

          {unbudgeted.length > 0 ? (
            <section className="rounded-2xl border border-dashed border-kraft bg-paper/60 px-4 py-3">
              <p className="text-sm font-semibold">
                ใช้จ่ายนอกงบ {thb(outsideSpent)} — ตั้งงบเพิ่มไหม?
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {unbudgeted.map((line) => (
                  <Link
                    key={line.category_id}
                    to={setupLink(line.category_id)}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-kraft bg-white px-3 text-sm hover:border-stamp/50"
                  >
                    <span className="text-ink/70">
                      <BudgetIcon axis={axis} id={line.category_id} icon={line.icon} className="h-4 w-4" emojiClass="text-sm" />
                    </span>
                    {budgetName(axis, line.category_id, line.category)}{" "}
                    <span className="font-mono tabular-nums">{thb(Number(line.spent))}</span>
                    <span className="font-semibold text-stamp">+ ตั้งงบ</span>
                  </Link>
                ))}
              </div>
            </section>
          ) : (
            budgeted.length > 0 && (
              <p className="px-1 text-xs font-semibold text-ledger">
                ✓ รายจ่ายเดือนนี้อยู่ในงบทั้งหมดแล้ว
              </p>
            )
          )}

          {options.length > 0 && (
            <Link
              to={setupLink()}
              className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-stamp text-sm font-semibold text-white hover:bg-stamp/90"
            >
              <PlusIcon className="h-5 w-5" aria-hidden="true" />
              ตั้งงบ{AXIS_LABEL[axis]}
            </Link>
          )}
        </>
      )}
    </div>
  );
}

const ratio = (l: BudgetLine) => Number(l.spent) / Math.max(Number(l.limit), 1);
const sum = (ls: BudgetLine[], key: "limit" | "spent") =>
  ls.reduce((acc, l) => acc + Number(l[key] ?? 0), 0);

/**
 * สินค้าที่สแกนมาและถูกนับเข้างบบรรทัดนี้ — เฉพาะรายการสินค้า ไม่รวมส่วนต่างท้ายบิล
 *
 * - แกนร้าน: ทุกชิ้นในใบที่ประเภทร้านตรงกัน (ยังไม่ได้จัดประเภท = ร้านอื่นๆ เหมือน backend)
 * - แกนสินค้า: ทุกชิ้นที่หมวดหลักตรงกัน (หมวดย่อยรวมขึ้นหมวดหลักแล้วใน category_root)
 */
function itemsOf(txs: Transaction[], axis: BudgetAxis, line: BudgetLine): BudgetItem[] {
  const rows: BudgetItem[] = [];
  for (const tx of txs) {
    if (axis === "merchant" && (tx.merchant_type ?? "other_shop") !== line.category_id) continue;
    for (const it of tx.items) {
      // นับแบบเดียวกับ backend (ทุกชิ้นที่มียอด รวมของแถม 0.00) ให้จำนวนตรงกับแถวงบ
      if (it.amount === null || it.amount === undefined) continue;
      const amount = Number(it.amount);
      if (axis === "item" && (it.category_root ?? FALLBACK) !== line.category) continue;
      rows.push({
        key: `${tx.id}-${it.id}`,
        name: it.name ?? "(ไม่มีชื่อรายการ)",
        date: tx.purchased_at,
        merchant: tx.merchant_name,
        amount,
        discount: it.discount ? Number(it.discount) : null,
        discountLabel: it.discount_label ?? null,
      });
    }
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date) || b.amount - a.amount);
}

// ---------------------------------------------------------------- ส่วนย่อย

/** สลับงบ "หมวดของ" กับ "ประเภทร้าน" — งบสองแบบแยกกันคนละชุด */
function AxisTabs({ value, onChange }: { value: BudgetAxis; onChange: (v: BudgetAxis) => void }) {
  const tabs: { id: BudgetAxis; hint: string }[] = [
    { id: "item", hint: "อาหาร · ของใช้ · การศึกษา" },
    { id: "merchant", hint: "ร้านอาหาร · 7-Eleven" },
  ];
  return (
    <div role="tablist" aria-label="วิธีแบ่งงบ" className="grid grid-cols-2 gap-1 rounded-2xl bg-ink/5 p-1">
      {tabs.map((t) => {
        const active = value === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={`flex min-h-[52px] flex-col items-center justify-center rounded-xl px-2 transition ${
              active ? "bg-white text-ink shadow-sm" : "text-ink/60 hover:text-ink"
            }`}
          >
            <span className={`text-sm ${active ? "font-bold" : "font-medium"}`}>{AXIS_LABEL[t.id]}</span>
            <span className="text-[11px] text-ink/50">{t.hint}</span>
          </button>
        );
      })}
    </div>
  );
}

/** แผ่นอธิบายว่างบสองแบบต่างกันยังไง — ใช้ใบ 7-Eleven ใบเดียวเป็นตัวอย่าง */
function AxisHelpSheet({ onClose }: { onClose: () => void }) {
  const closeBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const chip = "rounded-full px-2.5 py-0.5 text-[13px]";
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="axis-help-title"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-xl space-y-3.5 overflow-y-auto rounded-t-3xl bg-paper px-5 pb-6 pt-5 text-ink"
      >
        <div className="flex items-start justify-between">
          <h2 id="axis-help-title" className="text-lg font-bold">งบสองแบบต่างกันยังไง?</h2>
          <button
            ref={closeBtn}
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="-mr-2 -mt-1 grid h-10 w-10 place-items-center rounded-full text-ink/60 hover:bg-ink/5"
          >
            ✕
          </button>
        </div>
        <p className="text-sm text-ink/70">ตัวอย่าง: ซื้อของที่ 7-Eleven ใบเดียว ฿150</p>
        <div className="space-y-1 rounded-xl border border-kraft bg-white px-4 py-3 text-sm">
          {[["ข้าวกล่อง", 50], ["แชมพู", 70], ["ปากกา", 30]].map(([n, v]) => (
            <div key={n} className="flex justify-between">
              <span>{n}</span>
              <span className="font-mono">฿{v}</span>
            </div>
          ))}
        </div>
        <div className="space-y-1.5 rounded-xl border-2 border-pine bg-white px-4 py-3">
          <p className="font-bold">{AXIS_LABEL.item}</p>
          <p className="text-[13px] text-ink/70">แยกเงินตามของแต่ละชิ้น</p>
          <div className="flex flex-wrap gap-1.5">
            <span className={`${chip} bg-amber-100`}>อาหาร ฿50</span>
            <span className={`${chip} bg-pink-100`}>ของใช้ส่วนตัว ฿70</span>
            <span className={`${chip} bg-mist`}>การศึกษา ฿30</span>
          </div>
          <p className="text-xs font-semibold text-ledger">เหมาะกับ: คุมค่ากิน ค่าเรียน แยกเป็นเรื่อง ๆ</p>
        </div>
        <div className="space-y-1.5 rounded-xl border border-kraft bg-white px-4 py-3">
          <p className="font-bold">{AXIS_LABEL.merchant}</p>
          <p className="text-[13px] text-ink/70">นับทั้งใบเข้าประเภทของร้าน</p>
          <div className="flex flex-wrap gap-1.5">
            <span className={`${chip} bg-sky-100`}>สะดวกซื้อ ฿150</span>
          </div>
          <p className="text-xs font-semibold text-ledger">เหมาะกับ: คุมการเข้าร้านบางแบบ เช่น ลดเข้า 7-Eleven</p>
        </div>
        <p className="text-[13px] leading-relaxed text-ink/70">
          ยอด<strong className="text-ink">ใช้จ่ายทั้งเดือนเท่ากัน</strong>ทั้งสองแบบ ต่างกันแค่วิธีแบ่งกลุ่ม
          ตั้งงบแบบไหนก็ได้ หรือตั้งทั้งสองแบบก็ได้ งบสองแบบแยกกัน ไม่กระทบกัน
        </p>
        <button
          type="button"
          onClick={onClose}
          className="min-h-[48px] w-full rounded-xl bg-ink text-sm font-bold text-paper hover:bg-ink/90"
        >
          เข้าใจแล้ว
        </button>
      </div>
    </div>
  );
}

function MonthSwitcher({
  month,
  onChange,
}: {
  month: string;
  onChange: (m: string) => void;
}) {
  const arrow =
    "grid h-9 w-9 place-items-center rounded-full text-lg text-ink/60 hover:bg-ink/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-stamp";
  return (
    <div className="flex items-center">
      <button type="button" className={arrow} onClick={() => onChange(shiftMonth(month, -1))} aria-label="เดือนก่อนหน้า">
        ‹
      </button>
      <span className="min-w-[8.5rem] text-center text-sm font-medium" aria-live="polite">
        {monthLabel(month)}
      </span>
      <button type="button" className={arrow} onClick={() => onChange(shiftMonth(month, 1))} aria-label="เดือนถัดไป">
        ›
      </button>
    </div>
  );
}

/** การ์ดสรุปสีเข้ม — "เหลือในงบ" ตัวใหญ่ + บรรทัดล่างที่เหมือนกันทั้งสองแท็บ (ใช้จ่ายทั้งเดือน · นอกงบ) */
function SummaryCard({
  limit,
  spent,
  outside,
  daysLeft,
}: {
  limit: number;
  spent: number;
  outside: number;
  daysLeft: number;
}) {
  const remaining = limit - spent;
  const over = remaining < 0;
  const tone = toneOf(spent, limit);
  const pct = limit > 0 ? Math.min(spent / limit, 1) * 100 : 0;
  const perDay = !over && daysLeft > 0 ? remaining / daysLeft : null;
  const bar = tone === "ok" ? "bg-[#7FD3BF]" : tone === "near" ? "bg-brass" : "bg-stamp";

  return (
    <section aria-label="สรุปงบเดือนนี้" className="space-y-2 rounded-2xl bg-ink px-4 py-4 text-paper">
      <div className="flex items-baseline justify-between text-sm text-kraft">
        <span>{over ? "เกินงบ" : "เหลือในงบ"}</span>
        <span className="text-xs">{daysLeft === 0 ? "เดือนนี้ปิดยอดแล้ว" : `เหลือ ${daysLeft} วัน`}</span>
      </div>
      <p className={`font-mono text-3xl font-bold leading-tight tabular-nums ${over ? "text-[#F0A497]" : ""}`}>
        {thb(Math.abs(remaining))}
      </p>
      <div
        className="h-2 overflow-hidden rounded-full bg-paper/20"
        role="progressbar"
        aria-label="สัดส่วนที่ใช้ไปจากงบ"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
      >
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[13px] text-paper/85">
        ใช้ไป {thb(spent)} จากงบ {thb(limit)}
        {perDay !== null && (
          <>
            {" "}· วันละ <strong className="text-paper">{thb(perDay)}</strong>
          </>
        )}
      </p>
      <div className="flex justify-between border-t border-dashed border-paper/25 pt-2 text-xs text-kraft">
        <span>ใช้จ่ายทั้งเดือน {thb(spent + outside)}</span>
        <span>นอกงบ {thb(outside)}</span>
      </div>
    </section>
  );
}

function EmptyBudget({
  month,
  axis,
  total,
  busy,
  onCopy,
}: {
  month: string;
  axis: BudgetAxis;
  /** ใช้จ่ายทั้งเดือน (ยังไม่มีงบ จึงเป็นนอกงบทั้งหมด) */
  total: number;
  busy: boolean;
  /** null = เดือนก่อนไม่มีงบให้คัดลอก จึงไม่แสดงปุ่ม */
  onCopy: (() => void) | null;
}) {
  return (
    <section className="rounded-2xl bg-ink px-4 py-5 text-paper">
      <h2 className="font-semibold">ยังไม่ได้ตั้งงบ{AXIS_LABEL[axis]} เดือน{monthLabel(month)}</h2>
      <p className="mt-1 text-sm text-paper/75">
        ตั้งงบแล้วระบบจะเทียบกับรายจ่ายจากใบเสร็จให้ทุกครั้งที่บันทึก
      </p>
      {total > 0 && (
        <p className="mt-3 border-t border-dashed border-paper/25 pt-2 text-xs text-kraft">
          ใช้จ่ายทั้งเดือน {thb(total)}
        </p>
      )}
      {onCopy && (
        <button
          type="button"
          onClick={onCopy}
          disabled={busy}
          className="mt-3 min-h-[44px] rounded-xl bg-paper px-4 text-sm font-semibold text-ink hover:bg-paper/90 disabled:opacity-50"
        >
          {busy ? "กำลังคัดลอก…" : `ใช้งบเดียวกับเดือน${monthLabel(shiftMonth(month, -1))}`}
        </button>
      )}
    </section>
  );
}

/** พื้นหลังอ่อนของไอคอนตามสถานะ — ไม่ใช้สีของหมวดเพราะบางหมวดไม่มีสี */
const ICON_BG: Record<Tone, string> = {
  ok: "bg-mist text-pine",
  near: "bg-amber-100 text-amber-800",
  over: "bg-stamp/10 text-stamp",
};

function BudgetRow({
  axis,
  line,
  open,
  busy,
  onDetail,
  onEdit,
  onSave,
  onRemove,
}: {
  axis: BudgetAxis;
  line: BudgetLine;
  open: boolean;
  busy: boolean;
  /** แตะแถว = ดูรายการที่นับเข้างบนี้ */
  onDetail: () => void;
  /** ปุ่มดินสอ = แก้/ลบวงเงิน */
  onEdit: () => void;
  onSave: (limit: number) => void;
  onRemove: () => void;
}) {
  const limit = Number(line.limit);
  const spent = Number(line.spent);
  const tone = toneOf(spent, limit);
  const pct = limit > 0 ? Math.min(spent / limit, 1) * 100 : 100;
  const left = limit - spent;
  const name = budgetName(axis, line.category_id, line.category);

  return (
    <li className={open ? "bg-paper/60" : ""}>
      <div className="flex items-center gap-3 px-4 py-2.5">
        <button
          type="button"
          onClick={onDetail}
          aria-haspopup="dialog"
          className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-stamp"
        >
          <span className={`grid h-10 w-10 flex-none place-items-center rounded-xl ${ICON_BG[tone]}`}>
            <BudgetIcon axis={axis} id={line.category_id} icon={line.icon} className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2">
              <span className="truncate font-semibold">{name}</span>
              <span className={`flex-none text-sm ${left < 0 ? "text-stamp" : ""}`}>
                {left >= 0 ? "เหลือ " : "เกิน "}
                <strong className="font-mono tabular-nums">{thb(Math.abs(left))}</strong>
              </span>
            </span>
            <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-ink/10">
              <span className={`block h-full rounded-full ${TONE[tone].bar}`} style={{ width: `${pct}%` }} />
            </span>
            <span className="mt-1 block font-mono text-[11px] text-ink/55">
              {thb(spent)} / {thb(limit)} · {Math.round((spent / Math.max(limit, 1)) * 100)}%
              {line.recurring && " · ทุกเดือน"}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={onEdit}
          aria-label={`แก้งบ${name}`}
          aria-expanded={open}
          className="grid h-9 w-9 flex-none place-items-center rounded-lg border border-kraft bg-white text-ink/60 hover:text-ink"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
            <path d="M4 20h4L19 9l-4-4L4 16z" />
          </svg>
        </button>
      </div>

      {open && (
        <div className="px-4 pb-4">
          <LimitEditor
            initial={String(limit)}
            busy={busy}
            onSave={onSave}
            onCancel={onEdit}
            onRemove={onRemove}
          />
        </div>
      )}
    </li>
  );
}

function LimitEditor({
  initial,
  busy,
  onSave,
  onCancel,
  onRemove,
}: {
  initial: string;
  busy: boolean;
  onSave: (limit: number) => void;
  onCancel: () => void;
  onRemove?: () => void;
}) {
  const [value, setValue] = useState(initial);
  const amount = Number(value);
  const valid = value.trim() !== "" && Number.isFinite(amount) && amount > 0;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (valid && !busy) onSave(amount);
  };

  return (
    <form onSubmit={submit} className="mt-3 flex flex-wrap items-center gap-2">
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink/45">
          ฿
        </span>
        <input
          type="number"
          inputMode="decimal"
          // step="any" — ถ้าใส่ step={100} คู่กับ min={1} เบราว์เซอร์จะนับค่าที่ถูกต้องเป็น
          // 1, 101, 201, … แล้วปฏิเสธ 1000/5000 ("ค่าใกล้เคียงคือ 901 และ 1001")
          // การเช็คว่าต้องมากกว่า 0 ทำใน valid ด้านบนอยู่แล้ว
          min={0}
          step="any"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="วงเงินต่อเดือน (บาท)"
          placeholder="วงเงินต่อเดือน"
          className="w-40 rounded-lg border border-kraft bg-white py-2 pl-7 pr-3 font-mono text-sm tabular-nums focus:border-stamp focus:outline-none focus:ring-1 focus:ring-stamp"
        />
      </div>
      <button
        type="submit"
        disabled={!valid || busy}
        className="rounded-lg bg-stamp px-4 py-2 text-sm font-medium text-white hover:bg-stamp/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "กำลังบันทึก…" : "บันทึก"}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-lg px-3 py-2 text-sm text-ink/60 hover:bg-ink/5"
      >
        ยกเลิก
      </button>
      {onRemove && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (confirm("ลบงบของหมวดนี้? รายจ่ายจะยังอยู่ครบ")) onRemove();
          }}
          className="ml-auto rounded-lg px-3 py-2 text-sm text-stamp hover:bg-stamp/5 disabled:opacity-50"
        >
          ลบงบ
        </button>
      )}
    </form>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-stamp/40 bg-stamp/5 p-3 text-sm text-stamp">
      {message}
    </div>
  );
}