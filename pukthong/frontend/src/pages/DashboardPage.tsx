import { useQueries, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import { type Monthly, type Transaction, baht, fetchMonthly, fetchMonths, imageUrl } from "../api";
import { FALLBACK } from "../categories";
import { billDiscountText } from "../components/FormFields";

/**
 * หน้าสรุปรายจ่าย — ① กราฟวงกลมสัดส่วน + ตาราง ② กราฟแท่งเทียบหมวด ③ กราฟแท่งรายวัน
 *
 * ข้อมูลจริงทั้งหมดมาจาก fetchMonthly ตัวเดิม (ยังไม่มี endpoint แบบช่วงวันที่)
 * - รายเดือน: ใช้ by_category / by_day ที่ backend สรุปมาให้ตรงๆ
 * - กำหนดเอง: ดึงทุกเดือนที่ช่วงนั้นคร่อม แล้วสรุปเองจาก transactions
 *   ตามกติกาเดียวกับ backend (หมวดรายชิ้น ส่วนต่างจากยอดใบ เช่น VAT/ส่วนลด ไปที่ FALLBACK)
 *   พอ backend มี endpoint ช่วงวันที่ ให้เปลี่ยนแค่ฟังก์ชัน summarize ตัวเดียว
 *
 * หน้านี้ดูตาม "วันที่ซื้อ" เท่านั้น — มุมมองวันที่สแกนยังอยู่ที่หน้ารายการ
 * query key ใช้ชุดเดียวกับหน้ารายการ สลับสองหน้าแล้วไม่ยิงซ้ำ
 */

type View = "month" | "custom";

// ---------------------------------------------------------------- วันที่ (เวลาท้องถิ่นทั้งหมด)

const pad = (n: number) => String(n).padStart(2, "0");
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isoMonth = (d: Date) => isoDate(d).slice(0, 7);
const parseDate = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d || 1);
};
const addDays = (s: string, n: number) => {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return isoDate(d);
};
const shiftMonth = (month: string, n: number) => {
  const d = parseDate(month);
  return isoMonth(new Date(d.getFullYear(), d.getMonth() + n, 1));
};
const lastDayOf = (month: string) => {
  const d = parseDate(month);
  return isoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
};
const daysBetween = (a: string, b: string) =>
  Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86_400_000);
const monthsIn = (start: string, end: string) => {
  const out: string[] = [];
  for (let m = start.slice(0, 7); m <= end.slice(0, 7); m = shiftMonth(m, 1)) out.push(m);
  return out;
};
const isDate = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isMonth = (s: string | null): s is string => !!s && /^\d{4}-\d{2}$/.test(s);

const MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
const MONTHS_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

const monthShortLabel = (month: string) => {
  const d = parseDate(month);
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear() + 543}`;
};

const monthLabel = (month: string) => {
  const d = parseDate(month);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
};

const rangeLabel = (start: string, end: string) => {
  const a = parseDate(start);
  const b = parseDate(end);
  const by = b.getFullYear() + 543;
  if (a.getFullYear() !== b.getFullYear()) {
    return `${a.getDate()} ${MONTHS_SHORT[a.getMonth()]} ${a.getFullYear() + 543} – ${b.getDate()} ${MONTHS_SHORT[b.getMonth()]} ${by}`;
  }
  if (a.getMonth() !== b.getMonth()) {
    return `${a.getDate()} ${MONTHS_SHORT[a.getMonth()]} – ${b.getDate()} ${MONTHS_SHORT[b.getMonth()]} ${by}`;
  }
  return `${a.getDate()}–${b.getDate()} ${MONTHS_SHORT[b.getMonth()]} ${by}`;
};

/** ตัวเลขในกราฟและตารางปัดเป็นบาทเต็ม — ยอดละเอียดอยู่ใน title */
const whole = (n: number) => Math.round(n).toLocaleString("th-TH");

// ---------------------------------------------------------------- สรุปข้อมูล

type CategoryTotal = { category: string; total: number; count: number };
type Summary = {
  total: number;
  receipts: number;
  categories: CategoryTotal[];
  byDay: Map<string, number>;
  /** ใบเสร็จในช่วงที่เลือก — ใช้เปิดดูว่าแต่ละหมวดมีสินค้าชิ้นไหนบ้าง */
  txs: Transaction[];
};

function summarize(view: View, start: string, end: string, data: Monthly[]): Summary {
  if (view === "month" && data.length === 1) {
    const d = data[0];
    return {
      total: Number(d.expense_total),
      receipts: d.transaction_count,
      categories: d.by_category.map((c) => ({
        category: c.category,
        total: Number(c.total),
        count: c.count,
      })),
      byDay: new Map(d.by_day.map((x) => [x.date, Number(x.total)])),
      txs: d.transactions,
    };
  }

  const txs = data
    .flatMap((d) => d.transactions)
    .filter((t) => t.purchased_at >= start && t.purchased_at <= end);

  const cats = new Map<string, { total: number; count: number }>();
  const byDay = new Map<string, number>();
  const add = (category: string, amount: number, count: number) => {
    const cur = cats.get(category) ?? { total: 0, count: 0 };
    cur.total += amount;
    cur.count += count;
    cats.set(category, cur);
  };

  let total = 0;
  for (const tx of txs) {
    const txTotal = Number(tx.total);
    total += txTotal;
    byDay.set(tx.purchased_at, (byDay.get(tx.purchased_at) ?? 0) + txTotal);

    let itemsSum = 0;
    for (const item of tx.items) {
      const amount = Number(item.amount ?? 0);
      if (!amount) continue;
      itemsSum += amount;
      // จัดกลุ่มตามหมวดหลัก ให้ตรงกับที่ backend สรุปในมุมมองรายเดือน
      add(item.category_root ?? FALLBACK, amount, 1);
    }
    // VAT ส่วนลด ค่าบริการ ฯลฯ ที่ไม่อยู่ในรายชิ้น — ทำให้ผลรวมทุกหมวด = ยอดรวมเสมอ
    const rest = Math.round((txTotal - itemsSum) * 100) / 100;
    if (rest !== 0) add(tx.items.length ? FALLBACK : (tx.category_root ?? FALLBACK), rest, 0);
  }

  return {
    total,
    receipts: txs.length,
    categories: Array.from(cats, ([category, v]) => ({ category, ...v })).sort(
      (a, b) => b.total - a.total,
    ),
    byDay,
    txs,
  };
}

// ---------------------------------------------------------------- ของในแต่ละหมวด

type ItemRow = {
  key: string;
  name: string;
  /** หมวดย่อยที่ชิ้นนี้อยู่ (ถ้าไม่ใช่ตัวหมวดหลักเอง) */
  sub: string | null;
  merchant: string | null;
  date: string;
  amount: number;
  /** ส่วนลดของรายการนี้ (บวก) */
  discount: number | null;
  discountLabel?: string | null;
  receiptId: string | null;
};

/**
 * สินค้าทุกชิ้นที่ถูกนับเข้าหมวดนี้ — ใช้กติกาเดียวกับตอนรวมยอด ผลรวมจึงเท่ากับยอดหมวดเสมอ
 *
 * ช่อง "อื่นๆ" มีส่วนต่างระดับใบ (VAT ท้ายบิล ส่วนลด ค่าบริการ) ปนอยู่ด้วย
 * จึงแสดงเป็นบรรทัดแยกต่อใบ ไม่งั้นผู้ใช้จะหาไม่เจอว่ายอดหมวดนี้มาจากไหน
 */
function itemsIn(txs: Transaction[], category: string): ItemRow[] {
  const rows: ItemRow[] = [];
  for (const tx of txs) {
    let itemsSum = 0;
    for (const it of tx.items) {
      const amount = Number(it.amount ?? 0);
      if (!amount) continue;
      itemsSum += amount;
      if ((it.category_root ?? FALLBACK) !== category) continue;
      rows.push({
        key: `${tx.id}-${it.id}`,
        name: it.name ?? "(ไม่มีชื่อรายการ)",
        sub: it.category && it.category !== category ? it.category : null,
        merchant: tx.merchant_name,
        date: tx.purchased_at,
        amount,
        discount: it.discount ? Number(it.discount) : null,
        discountLabel: it.discount_label ?? null,
        receiptId: tx.receipt_id,
      });
    }
    const rest = Math.round((Number(tx.total) - itemsSum) * 100) / 100;
    const restCategory = tx.items.length ? FALLBACK : (tx.category_root ?? FALLBACK);
    if (rest !== 0 && restCategory === category) {
      rows.push({
        key: `${tx.id}-rest`,
        // ส่วนลดท้ายบิลมีชื่อให้ (เช่น ใช้คะแนน The 1) — บอกตรงๆ ว่ายอดติดลบมาจากอะไร
        name: !tx.items.length
          ? "ทั้งใบ (ไม่มีรายการย่อย)"
          : tx.bill_discounts?.length
            ? tx.bill_discounts.map(billDiscountText).join(" · ")
            : "ส่วนต่างท้ายบิล (VAT/ส่วนลด/ค่าบริการ)",
        sub: null,
        merchant: tx.merchant_name,
        date: tx.purchased_at,
        amount: rest,
        discount: null,
        receiptId: tx.receipt_id,
      });
    }
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date) || b.amount - a.amount);
}

function CategoryItems({ txs, category }: { txs: Transaction[]; category: string }) {
  const rows = itemsIn(txs, category);
  if (rows.length === 0) {
    return <p className="pb-3 pl-6 text-xs text-ink/40">ไม่มีรายการ</p>;
  }
  return (
    <ul className="space-y-2.5 pb-3 pl-6">
      {rows.map((r) => (
        <li key={r.key} className="flex items-start gap-3 text-xs">
          <div className="min-w-0 flex-1">
            <p className="truncate text-ink/75">
              {r.name}
              {r.sub && <span className="ml-1.5 text-ink/40">· {r.sub}</span>}
            </p>
            {r.discount ? (
              <p className="text-red-700/80">
                🏷️ ส่วนลด{r.discountLabel ? ` ${r.discountLabel}` : ""} −{baht(r.discount)} (ราคาเต็ม {baht(r.amount + r.discount)})
              </p>
            ) : null}
            <p className="truncate text-ink/40">
              {thaiDate(r.date)}
              {r.merchant && ` · ${r.merchant}`}
              {/* เปิดรูปในแท็บใหม่ ไม่ใช่ /review — หน้านั้นเปิดตรงๆ จะเป็นฟอร์มว่างรอสแกนใหม่
                  ถ้าผู้ใช้กดบันทึกจะได้รายการซ้ำ */}
              {r.receiptId && (
                <a
                  href={imageUrl(r.receiptId)}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-1.5 underline underline-offset-2 hover:text-ink/70"
                >
                  ดูรูปใบเสร็จ
                </a>
              )}
            </p>
          </div>
          <span className="shrink-0 tabular-nums text-ink/70">{baht(r.amount)}</span>
        </li>
      ))}
    </ul>
  );
}

const thaiDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short" });

// ---------------------------------------------------------------- สีของกราฟ

/**
 * จำกัดไว้ 5 สี (4 หมวดแรก + รวมที่เหลือ) — เกินนี้คนเริ่มแยกสีไม่ออก
 * สีเดียวกันทั้งกราฟวงกลม ตาราง และกราฟแท่ง จับคู่กันได้ทันที
 * (ใช้ค่าสีตรงๆ เพราะ SVG fill ต้องรู้สีตอน render)
 */
const PALETTE = ["#BD4A3C", "#D4A13A", "#3A6B4C", "#6F86A0", "#B9AD93"];

type Slice = {
  key: string;
  label: string;
  total: number;
  count: number;
  color: string;
  /** มีค่าเฉพาะชิ้นที่รวมหลายหมวด */
  members?: CategoryTotal[];
};

function toSlices(categories: CategoryTotal[]): Slice[] {
  const sorted = [...categories].sort((a, b) => b.total - a.total);
  const own = sorted.length <= PALETTE.length ? sorted : sorted.slice(0, PALETTE.length - 1);
  const rest = sorted.slice(own.length);

  const slices: Slice[] = own.map((c, i) => ({
    key: c.category,
    label: c.category,
    total: c.total,
    count: c.count,
    color: PALETTE[i],
  }));
  if (rest.length > 0) {
    slices.push({
      key: "__rest",
      label: `อีก ${rest.length} หมวด`,
      total: rest.reduce((s, c) => s + c.total, 0),
      count: rest.reduce((s, c) => s + c.count, 0),
      color: PALETTE[PALETTE.length - 1],
      members: rest,
    });
  }
  return slices;
}

// ---------------------------------------------------------------- page

export default function DashboardPage() {
  const [params, setParams] = useSearchParams();
  const now = new Date();
  const today = isoDate(now);
  const currentMonth = isoMonth(now);

  const rawView = params.get("view");
  // ลิงก์เก่า ?view=week เปิดเป็นรายเดือน (ตัดรายสัปดาห์ออกแล้ว)
  const view: View = rawView === "custom" ? "custom" : "month";

  let start: string;
  let end: string;
  let month = currentMonth;
  if (view === "month") {
    const m = params.get("month");
    month = isMonth(m) ? m : currentMonth;
    start = `${month}-01`;
    end = lastDayOf(month);
  } else {
    const s = params.get("start");
    const e = params.get("end");
    start = isDate(s) ? s : `${currentMonth}-01`;
    end = isDate(e) ? e : today;
  }

  const rangeError =
    start > end
      ? "วันเริ่มต้องไม่อยู่หลังวันสิ้นสุด"
      : daysBetween(start, end) > 366
        ? "เลือกช่วงได้ไม่เกิน 1 ปี"
        : null;

  const switchView = (next: View) => {
    if (next === view) return;
    if (next === "month") setParams({ view: "month", month: start.slice(0, 7) });
    else setParams({ view: "custom", start, end: end > today && start <= today ? today : end });
  };

  const months = rangeError ? [] : monthsIn(start, end);
  const results = useQueries({
    queries: months.map((m) => ({
      queryKey: ["monthly", m, "purchased"],
      queryFn: () => fetchMonthly(m, "purchased"),
    })),
  });

  const isPending = results.some((r) => r.isPending);
  const error = results.find((r) => r.isError)?.error as Error | undefined;
  const ready = !rangeError && !isPending && !error;
  const summary = ready
    ? summarize(view, start, end, results.map((r) => r.data as Monthly))
    : null;

  return (
    <div className="mx-auto max-w-xl space-y-4 text-ink">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">สรุปรายจ่าย</h1>
        {view === "month" && (
          <Stepper
            label={monthShortLabel(month)}
            prevLabel="เดือนก่อนหน้า"
            nextLabel="เดือนถัดไป"
            onPrev={() => setParams({ view, month: shiftMonth(month, -1) })}
            onNext={() => setParams({ view, month: shiftMonth(month, 1) })}
          />
        )}
      </header>

      <ViewTabs value={view} onChange={switchView} />

      {view === "custom" && (
        <RangePicker
          start={start}
          end={end}
          onChange={(s, e) => setParams({ view, start: s, end: e })}
        />
      )}

      {rangeError && <Notice tone="warn">{rangeError}</Notice>}
      {!rangeError && isPending && <p className="text-sm text-ink/50">กำลังโหลด…</p>}
      {error && <Notice tone="error">{error.message}</Notice>}

      {summary && summary.receipts === 0 && (
        <EmptyState
          month={view === "month" ? month : null}
          onPick={(m) => setParams({ view: "month", month: m })}
        />
      )}

      {summary && summary.receipts > 0 && (
        <>
          <Breakdown summary={summary} start={start} end={end} today={today} />
          <CategoryBars summary={summary} />
          <DailyChart start={start} end={end} today={today} byDay={summary.byDay} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- ส่วนควบคุม

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stamp";

function ViewTabs({ value, onChange }: { value: View; onChange: (v: View) => void }) {
  const tabs: [View, string][] = [
    ["month", "รายเดือน"],
    ["custom", "กำหนดเอง"],
  ];
  return (
    <div className="grid grid-cols-2 gap-1 rounded-xl bg-ink/5 p-1" role="group" aria-label="ช่วงเวลาที่สรุป">
      {tabs.map(([key, label]) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          className={`min-h-[40px] rounded-lg text-sm transition ${focusRing} ${
            value === key ? "bg-white font-bold text-ink shadow-sm" : "font-medium text-ink/60 hover:text-ink"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Stepper({
  label,
  prevLabel,
  nextLabel,
  onPrev,
  onNext,
}: {
  label: string;
  prevLabel: string;
  nextLabel: string;
  onPrev: () => void;
  onNext: () => void;
}) {
  const arrow = `grid h-10 w-10 place-items-center rounded-lg border border-kraft bg-white text-lg text-ink/70 hover:bg-ink/5 ${focusRing}`;
  return (
    <div className="flex items-center gap-1">
      <button type="button" className={arrow} onClick={onPrev} aria-label={prevLabel}>
        ‹
      </button>
      <span className="min-w-[5rem] text-center text-sm font-bold" aria-live="polite">
        {label}
      </span>
      <button type="button" className={arrow} onClick={onNext} aria-label={nextLabel}>
        ›
      </button>
    </div>
  );
}

function RangePicker({
  start,
  end,
  onChange,
}: {
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
}) {
  const input =
    "min-w-0 flex-1 rounded-lg border border-kraft bg-white px-3 py-2 text-sm focus:border-stamp focus:outline-none focus:ring-1 focus:ring-stamp";
  return (
    <div className="flex items-center gap-2">
      <input
        type="date"
        aria-label="วันเริ่ม"
        value={start}
        onChange={(e) => e.target.value && onChange(e.target.value, end)}
        className={input}
      />
      <span className="text-sm text-ink/50">ถึง</span>
      <input
        type="date"
        aria-label="วันสิ้นสุด"
        value={end}
        onChange={(e) => e.target.value && onChange(start, e.target.value)}
        className={input}
      />
    </div>
  );
}

function Notice({ tone, children }: { tone: "warn" | "error"; children: React.ReactNode }) {
  const style =
    tone === "error"
      ? "border-stamp/40 bg-stamp/5 text-stamp"
      : "border-amber-300 bg-amber-50 text-amber-800";
  return <div className={`rounded-lg border p-3 text-sm ${style}`}>{children}</div>;
}

// ---------------------------------------------------------------- การ์ด

const card = "rounded-2xl border border-kraft bg-white p-4";

function CardTitle({ n, title, note }: { n: string; title: string; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="font-bold">
        {n} {title}
      </h2>
      {note && <span className="text-right text-xs text-ink/55">{note}</span>}
    </div>
  );
}

// ---------------------------------------------------------------- ① กราฟวงกลม + ตาราง

const VB_W = 360;
const VB_H = 250;
const CX = VB_W / 2;
const CY = VB_H / 2;
const OUTER = 92;
const INNER = 52;
/** ชิ้นที่เล็กกว่านี้เขียน % ข้างในไม่พอ — ดึงเส้นออกมาเขียนชื่อ + % ด้านนอก */
const INSIDE_MIN = 0.08;

const at = (angle: number, radius: number) =>
  [CX + radius * Math.cos(angle), CY + radius * Math.sin(angle)] as const;

const pctText = (share: number) => (share > 0 && share < 0.01 ? "<1%" : `${Math.round(share * 100)}%`);

/** ชื่อยาวเกินจะล้นขอบ SVG — ตัดให้สั้นพอสำหรับป้ายนอกวง */
const shortLabel = (s: string) => (s.length > 12 ? `${s.slice(0, 11)}…` : s);

function Breakdown({
  summary,
  start,
  end,
  today,
}: {
  summary: Summary;
  start: string;
  end: string;
  today: string;
}) {
  const slices = toSlices(summary.categories);
  const grand = summary.total;
  const share = (n: number) => (grand > 0 ? n / grand : 0);

  // ยอดติดลบ (เช่นส่วนลดใน FALLBACK) วาดในวงกลมไม่ได้ แต่ยังแสดงในตารางตามจริง
  const drawn = slices.filter((s) => s.total > 0);
  const drawnSum = drawn.reduce((s, x) => s + x.total, 0);

  let angle = -Math.PI / 2;
  let outside = 0;
  const parts = drawn.map((s) => {
    const sweep = (s.total / drawnSum) * 2 * Math.PI;
    const a0 = angle;
    const a1 = angle + sweep;
    angle = a1;
    const inside = s.total / drawnSum >= INSIDE_MIN;
    // ป้ายนอกวงที่อยู่ติดกันสลับระยะใกล้/ไกล กันตัวหนังสือทับกัน
    const stagger = inside ? 0 : (outside++ % 2) * 16;
    return { s, a0, a1, mid: (a0 + a1) / 2, inside, stagger };
  });

  // ช่วงที่ยังไม่จบ (เดือนนี้) แสดงถึงวันนี้ — "1–26 พ.ย." ไม่ใช่ "1–30 พ.ย."
  const shownEnd = end > today && start <= today ? today : end;

  return (
    <section aria-label="สัดส่วนรายจ่ายตามหมวด" className={card}>
      <CardTitle
        n="①"
        title="สัดส่วนรายจ่าย"
        note={`${rangeLabel(start, shownEnd)} · ${summary.receipts} ใบเสร็จ`}
      />

      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="mx-auto mt-1 block w-full max-w-[360px]"
        role="img"
        aria-label={drawn.map((s) => `${s.label} ${pctText(share(s.total))}`).join(", ")}
      >
        {parts.length === 1 ? (
          <circle
            cx={CX}
            cy={CY}
            r={(OUTER + INNER) / 2}
            fill="none"
            stroke={parts[0].s.color}
            strokeWidth={OUTER - INNER}
          />
        ) : (
          parts.map(({ s, a0, a1 }) => {
            const large = a1 - a0 > Math.PI ? 1 : 0;
            const [x1, y1] = at(a0, OUTER);
            const [x2, y2] = at(a1, OUTER);
            const [x3, y3] = at(a1, INNER);
            const [x4, y4] = at(a0, INNER);
            return (
              <path
                key={s.key}
                d={`M${x1} ${y1}A${OUTER} ${OUTER} 0 ${large} 1 ${x2} ${y2}L${x3} ${y3}A${INNER} ${INNER} 0 ${large} 0 ${x4} ${y4}Z`}
                fill={s.color}
                stroke="#FFFFFF"
                strokeWidth={2}
              />
            );
          })
        )}

        {parts.map(({ s, mid, inside, stagger }) => {
          const text = pctText(s.total / drawnSum);
          if (inside) {
            const [tx, ty] = at(mid, (OUTER + INNER) / 2);
            return (
              <text key={s.key} x={tx} y={ty + 5} textAnchor="middle" fontSize={14} fontWeight={700} fill="#FFFFFF">
                {text}
              </text>
            );
          }
          const [ex, ey] = at(mid, OUTER + 3);
          const [lx, ly] = at(mid, OUTER + 16 + stagger);
          const right = Math.cos(mid) >= 0;
          const hx = lx + (right ? 14 : -14);
          return (
            <g key={s.key}>
              <polyline points={`${ex},${ey} ${lx},${ly} ${hx},${ly}`} fill="none" stroke={s.color} strokeWidth={1.5} />
              <text
                x={hx + (right ? 4 : -4)}
                y={ly + 4}
                textAnchor={right ? "start" : "end"}
                fontSize={12}
                fontWeight={700}
                fill="#211D17"
              >
                {shortLabel(s.label)} {text}
              </text>
            </g>
          );
        })}

        <text x={CX} y={CY - 6} textAnchor="middle" fontSize={11} fill="#5E5647">
          รวม
        </text>
        <text x={CX} y={CY + 14} textAnchor="middle" fontSize={17} fontWeight={700} fill="#211D17" className="font-mono">
          ฿{whole(grand)}
        </text>
      </svg>

      <ul className="mt-1">
        {slices.map((s) => (
          <LegendRow key={s.key} slice={s} share={share} txs={summary.txs} />
        ))}
      </ul>
    </section>
  );
}

function LegendRow({
  slice,
  share,
  txs,
}: {
  slice: Slice;
  share: (n: number) => number;
  txs: Transaction[];
}) {
  const [open, setOpen] = useState(false);
  const grouped = !!slice.members;

  return (
    <li className="border-t border-kraft/60">
      {/* ทุกแถวกดได้: หมวดเดี่ยวเปิดดูรายการที่สแกนมา, แถว "อีก N หมวด" เปิดดูหมวดที่ถูกรวมไว้ */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`grid w-full grid-cols-[12px_1fr_auto_auto] items-center gap-x-3 py-2.5 text-left text-sm ${focusRing}`}
      >
        <span className="h-3 w-3 rounded-[3px]" style={{ backgroundColor: slice.color }} aria-hidden />
        <span className="min-w-0 truncate">
          <span className="font-semibold">{slice.label}</span>
          <span className="ml-1.5 text-xs text-ink/50">
            {open ? "ซ่อน" : grouped ? "ดูทั้งหมด" : `${slice.count} รายการ`}
          </span>
        </span>
        <span className="w-10 text-right text-xs tabular-nums text-ink/55">{pctText(share(slice.total))}</span>
        <span className="w-20 text-right font-mono font-bold tabular-nums" title={`฿${baht(slice.total)}`}>
          ฿{whole(slice.total)}
        </span>
      </button>

      {!grouped && open && <CategoryItems txs={txs} category={slice.label} />}

      {grouped && open && (
        <ul className="space-y-2 pb-3 pl-6">
          {slice.members!.map((m) => (
            <MemberRow key={m.category} member={m} share={share} txs={txs} />
          ))}
        </ul>
      )}

      {(slice.label === FALLBACK || slice.members?.some((m) => m.category === FALLBACK)) && (
        <p className="-mt-1 pb-2.5 pl-6 text-xs text-ink/45">
          {FALLBACK} รวม VAT ส่วนลด และของที่ยังไม่ได้เลือกหมวด
        </p>
      )}
    </li>
  );
}

/** หมวดที่ถูกรวมอยู่ในแถว "อีก N หมวด" — กดเปิดดูรายการของหมวดนั้นได้เหมือนแถวปกติ */
function MemberRow({
  member: m,
  share,
  txs,
}: {
  member: CategoryTotal;
  share: (n: number) => number;
  txs: Transaction[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex w-full items-center gap-3 text-left text-xs ${focusRing}`}
      >
        <span className="min-w-0 flex-1 truncate text-ink/70">
          {m.category}
          <span className="ml-1 text-ink/45">{open ? "ซ่อน" : `${m.count} รายการ`}</span>
        </span>
        <span className="w-10 text-right tabular-nums text-ink/50">{pctText(share(m.total))}</span>
        <span className="w-20 text-right font-mono tabular-nums text-ink/75" title={`฿${baht(m.total)}`}>
          ฿{whole(m.total)}
        </span>
      </button>
      {open && <div className="mt-2"><CategoryItems txs={txs} category={m.category} /></div>}
    </li>
  );
}

// ---------------------------------------------------------------- ② กราฟแท่งเทียบหมวด

/** ระยะเส้นแกนที่อ่านง่าย (1, 2, 2.5, 5 × 10^n) ให้ได้ราว 3 เส้น */
function niceStep(max: number) {
  const raw = max / 3;
  const pow = 10 ** Math.floor(Math.log10(raw));
  return ([1, 2, 2.5, 5, 10].find((m) => m * pow >= raw) ?? 10) * pow;
}

const BAR_H = 150;

function CategoryBars({ summary }: { summary: Summary }) {
  const slices = toSlices(summary.categories);
  const max = Math.max(...slices.map((s) => s.total), 0);
  if (max <= 0) return null;
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: Math.round(top / step) }, (_, i) => (i + 1) * step);

  return (
    <section aria-label="เทียบรายจ่ายแต่ละหมวด" className={card}>
      <CardTitle n="②" title="เทียบแต่ละหมวด" note="บาท" />

      <div className="relative mt-4" style={{ height: BAR_H + 22 }}>
        {/* เส้นแกน — ป้ายตัวเลขชิดซ้าย แท่งเริ่มหลังป้าย */}
        <div className="absolute inset-x-0 bottom-0" style={{ top: 22 }} aria-hidden>
          <div className="absolute inset-x-0 bottom-0 border-t border-kraft" />
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0" style={{ bottom: (t / top) * BAR_H }}>
              <div className="border-t border-dashed border-kraft/60" />
              <span className="absolute bottom-0.5 left-0 font-mono text-[10px] text-ink/45">
                {t >= 1000 ? `${(t / 1000).toLocaleString("th-TH")}k` : t}
              </span>
            </div>
          ))}
        </div>

        <div className="absolute inset-y-0 left-9 right-0 flex items-end">
          {slices.map((s) => {
            const h = Math.max((Math.max(s.total, 0) / top) * BAR_H, 3);
            return (
              <div key={s.key} className="flex h-full flex-1 flex-col items-center justify-end">
                <span className="mb-1 font-mono text-[11px] font-bold tabular-nums sm:text-xs">฿{whole(s.total)}</span>
                <div
                  className="w-3/5 max-w-[48px] rounded-t-md"
                  style={{ height: h, backgroundColor: s.color }}
                  title={`${s.label} ฿${baht(s.total)}`}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="ml-9 mt-1.5 flex">
        {slices.map((s) => (
          <span key={s.key} className="line-clamp-2 flex-1 px-0.5 text-center text-[11px] leading-tight text-ink/75">
            {s.label}
          </span>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- ③ กราฟแท่งรายวัน

function DailyChart({
  start,
  end,
  today,
  byDay,
}: {
  start: string;
  end: string;
  today: string;
  byDay: Map<string, number>;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const span = daysBetween(start, end) + 1;
  // ช่วงยาวเกินสองเดือนแท่งจะแคบจนอ่านไม่ออก — ข้ามไปเลยดีกว่าแสดงแบบอ่านไม่ได้
  if (span > 62 || byDay.size === 0) return null;

  const days = Array.from({ length: span }, (_, i) => addDays(start, i));
  const values = days.map((d) => byDay.get(d) ?? 0);
  const max = Math.max(...values, 0);
  const spentDays = values.filter((v) => v > 0).length;
  // ค่าเริ่มต้นชี้วันที่ใช้มากสุด — แตะแท่งอื่นเพื่อดูยอดวันนั้น
  const selected = picked && days.includes(picked) ? picked : days[values.indexOf(max)];
  const selectedValue = byDay.get(selected) ?? 0;
  const every = span <= 14 ? 1 : span <= 31 ? 5 : 7;
  const todayIndex = days.indexOf(today);
  const label = (d: string) => {
    const date = parseDate(d);
    return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
  };

  return (
    <section aria-label="รายจ่ายแต่ละวัน" className={card}>
      <CardTitle n="③" title="ใช้จ่ายแต่ละวัน" note={`มีรายจ่าย ${spentDays} วัน`} />

      <p className="mt-2 text-sm" aria-live="polite">
        <span className="text-ink/60">{label(selected)}</span>{" "}
        <strong className="font-mono tabular-nums">฿{whole(selectedValue)}</strong>
        {selected === days[values.indexOf(max)] && max > 0 && (
          <span className="ml-1.5 text-xs text-stamp">· มากที่สุด</span>
        )}
      </p>

      <div className="mt-2 flex h-28 items-end gap-[2px] border-b border-kraft">
        {days.map((d, i) => {
          const v = values[i];
          const active = d === selected;
          return (
            <button
              key={d}
              type="button"
              onClick={() => setPicked(d)}
              aria-label={`${label(d)} ฿${baht(v)}`}
              aria-pressed={active}
              className={`flex h-full min-w-0 flex-1 flex-col justify-end ${focusRing}`}
            >
              <span
                className={`block w-full rounded-t-sm ${
                  v > 0 ? (active ? "bg-stamp" : "bg-ink/75") : active ? "bg-stamp/40" : "bg-ink/10"
                }`}
                style={{ height: v > 0 && max > 0 ? `${(v / max) * 100}%` : "2px", minHeight: "2px" }}
              />
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex gap-[2px]" aria-hidden>
        {days.map((d, i) => {
          const date = parseDate(d);
          // วันนี้ (ตัวแดง) แสดงเสมอ — ป้ายปกติที่ชิดวันนี้เกินไปซ่อน กันตัวเลขทับกัน
          const show = d === today || (i % every === 0 && (todayIndex < 0 || Math.abs(i - todayIndex) > 2));
          return (
            <span
              key={d}
              className={`min-w-0 flex-1 overflow-visible whitespace-nowrap text-center text-[10px] tabular-nums ${
                d === today ? "font-bold text-stamp" : "text-ink/45"
              }`}
            >
              {show ? date.getDate() : ""}
            </span>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- ว่างเปล่า

/**
 * ช่วงนี้ว่าง — รายเดือนจะบอกด้วยว่ารายจ่ายไปอยู่เดือนไหน
 * ใบเสร็จจัดเข้าเดือนตามวันที่บนใบ ถ่ายใบเก่าหรือ AI อ่านปีผิดเมื่อไหร่
 * ข้อมูลจะไปโผล่เดือนอื่นแล้วดูเหมือนหายไป ถ้าไม่มีตัวนี้บอก
 */
function EmptyState({ month, onPick }: { month: string | null; onPick: (m: string) => void }) {
  // ห่อด้วย arrow — ส่ง fetchMonths ตรงๆ React Query จะยัด context เป็นอาร์กิวเมนต์แรก
  const { data: months } = useQuery({
    queryKey: ["months", "purchased"],
    queryFn: () => fetchMonths("purchased"),
    enabled: month !== null,
  });
  const others = (months ?? []).filter((m) => m.month !== month);

  return (
    <div className="rounded-xl border border-dashed border-kraft px-6 py-8 text-center">
      <p className="text-sm text-ink/70">
        ยังไม่มีรายจ่ายใน{month ? "เดือนนี้" : "ช่วงนี้"}
      </p>
      {others.length === 0 ? (
        <p className="mt-1 text-xs text-ink/45">ถ่ายใบเสร็จสักใบแล้วกลับมาดูใหม่</p>
      ) : (
        <>
          <p className="mt-4 text-xs text-ink/55">มีรายจ่ายอยู่ในเดือนเหล่านี้ (ตามวันที่บนใบเสร็จ)</p>
          <ul className="mx-auto mt-3 flex max-w-sm flex-col gap-1">
            {others.map((m) => (
              <li key={m.month}>
                <button
                  type="button"
                  onClick={() => onPick(m.month)}
                  className={`flex w-full items-center justify-between rounded-lg border border-kraft px-3 py-2 text-sm hover:bg-ink/5 ${focusRing}`}
                >
                  <span>{monthLabel(m.month)}</span>
                  <span className="tabular-nums text-ink/60">
                    ฿{baht(m.total)}
                    <span className="ml-2 text-xs text-ink/40">{m.count} ใบ</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}