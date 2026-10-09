import { useQueries, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import { type Monthly, baht, fetchMonthly, fetchMonths } from "../api";
import { FALLBACK } from "../categories";

/**
 * หน้าสรุปรายจ่าย — โดนัทสัดส่วนหมวด + รายการหมวด + ยอดรายวัน
 *
 * ข้อมูลจริงทั้งหมดมาจาก fetchMonthly ตัวเดิม (ยังไม่มี endpoint แบบช่วงวันที่)
 * - รายเดือน: ใช้ by_category / by_day ที่ backend สรุปมาให้ตรงๆ
 * - รายสัปดาห์ / กำหนดเอง: ดึงทุกเดือนที่ช่วงนั้นคร่อม แล้วสรุปเองจาก transactions
 *   ตามกติกาเดียวกับ backend (หมวดรายชิ้น ส่วนต่างจากยอดใบ เช่น VAT/ส่วนลด ไปที่ FALLBACK)
 *   พอ backend มี endpoint ช่วงวันที่ ให้เปลี่ยนแค่ฟังก์ชัน summarize ตัวเดียว
 *
 * หน้านี้ดูตาม "วันที่ซื้อ" เท่านั้น — มุมมองวันที่สแกนยังอยู่ที่หน้ารายการ
 * query key ใช้ชุดเดียวกับหน้ารายการ สลับสองหน้าแล้วไม่ยิงซ้ำ
 */

type View = "month" | "week" | "custom";

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
/** สัปดาห์เริ่มวันจันทร์ */
const mondayOf = (s: string) => addDays(s, -((parseDate(s).getDay() + 6) % 7));
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
const WEEKDAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

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

/** ตัวเลขในโดนัทและรายการปัดเป็นบาทเต็ม — ยอดละเอียดอยู่ใน title */
const whole = (n: number) => Math.round(n).toLocaleString("th-TH");

// ---------------------------------------------------------------- สรุปข้อมูล

type CategoryTotal = { category: string; total: number; count: number };
type Summary = {
  total: number;
  receipts: number;
  categories: CategoryTotal[];
  byDay: Map<string, number>;
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
      add(item.category ?? FALLBACK, amount, 1);
    }
    // VAT ส่วนลด ค่าบริการ ฯลฯ ที่ไม่อยู่ในรายชิ้น — ทำให้ผลรวมทุกหมวด = ยอดรวมเสมอ
    const rest = Math.round((txTotal - itemsSum) * 100) / 100;
    if (rest !== 0) add(tx.items.length ? FALLBACK : (tx.category ?? FALLBACK), rest, 0);
  }

  return {
    total,
    receipts: txs.length,
    categories: Array.from(cats, ([category, v]) => ({ category, ...v })).sort(
      (a, b) => b.total - a.total,
    ),
    byDay,
  };
}

// ---------------------------------------------------------------- สีของโดนัท

/**
 * จำกัดไว้ 5 สี (4 หมวดแรก + รวมที่เหลือ) — เกินนี้คนเริ่มแยกสีไม่ออก
 * โดยเฉพาะคนตาบอดสี ชื่อหมวดในรายการด้านล่างยังเป็นตัวบอกหลักเสมอ
 */
const PALETTE = [
  { stroke: "stroke-stamp", swatch: "bg-stamp" },
  { stroke: "stroke-brass", swatch: "bg-brass" },
  { stroke: "stroke-ledger", swatch: "bg-ledger" },
  { stroke: "stroke-ink/60", swatch: "bg-ink/60" },
  { stroke: "stroke-ink/25", swatch: "bg-ink/25" },
];

type Slice = {
  key: string;
  label: string;
  total: number;
  count: number;
  color: (typeof PALETTE)[number];
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
  const view: View = rawView === "week" || rawView === "custom" ? rawView : "month";

  let start: string;
  let end: string;
  let month = currentMonth;
  if (view === "month") {
    const m = params.get("month");
    month = isMonth(m) ? m : currentMonth;
    start = `${month}-01`;
    end = lastDayOf(month);
  } else if (view === "week") {
    const s = params.get("start");
    start = mondayOf(isDate(s) ? s : today);
    end = addDays(start, 6);
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
    // จากรายเดือนไปรายสัปดาห์: ถ้าเป็นเดือนนี้ เปิดสัปดาห์นี้ ไม่งั้นเปิดสัปดาห์แรกของเดือน
    else if (next === "week")
      setParams({ view: "week", start: view === "month" && month === currentMonth ? today : start });
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
    <div className="mx-auto max-w-xl space-y-6 text-ink">
      <h1 className="text-2xl font-semibold">สรุปรายจ่าย</h1>

      <ViewTabs value={view} onChange={switchView} />

      {view === "month" && (
        <Stepper
          label={monthLabel(month)}
          prevLabel="เดือนก่อนหน้า"
          nextLabel="เดือนถัดไป"
          onPrev={() => setParams({ view, month: shiftMonth(month, -1) })}
          onNext={() => setParams({ view, month: shiftMonth(month, 1) })}
        />
      )}
      {view === "week" && (
        <Stepper
          label={rangeLabel(start, end)}
          prevLabel="สัปดาห์ก่อนหน้า"
          nextLabel="สัปดาห์ถัดไป"
          onPrev={() => setParams({ view, start: addDays(start, -7) })}
          onNext={() => setParams({ view, start: addDays(start, 7) })}
        />
      )}
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
          <Breakdown summary={summary} />
          <DailyChart view={view} start={start} end={end} byDay={summary.byDay} />
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
    ["week", "รายสัปดาห์"],
    ["custom", "กำหนดเอง"],
  ];
  return (
    <div className="flex gap-2" role="group" aria-label="ช่วงเวลาที่สรุป">
      {tabs.map(([key, label]) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          className={`rounded-full px-5 py-2 text-sm font-medium transition ${focusRing} ${
            value === key
              ? "bg-ink text-paper"
              : "border border-kraft text-ink/70 hover:bg-ink/5"
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
  const arrow = `grid h-9 w-9 place-items-center rounded-full text-lg text-ink/60 hover:bg-ink/5 ${focusRing}`;
  return (
    <div className="flex items-center justify-between rounded-full border border-kraft px-1 py-1">
      <button type="button" className={arrow} onClick={onPrev} aria-label={prevLabel}>
        ‹
      </button>
      <span className="text-sm font-medium" aria-live="polite">
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

// ---------------------------------------------------------------- โดนัท + รายการ

const R = 80;
const STROKE = 36;
const CIRC = 2 * Math.PI * R;
/** ช่องว่างระหว่างชิ้น — โปร่งใส เห็นพื้นหลังเดิม ไม่ต้องจับคู่สีพื้น */
const GAP = 2.5;

function Breakdown({ summary }: { summary: Summary }) {
  const slices = toSlices(summary.categories);
  const grand = summary.total;
  const pct = (n: number) => (grand > 0 ? Math.round((n / grand) * 100) : 0);

  // ยอดติดลบ (เช่นส่วนลดใน FALLBACK) วาดในโดนัทไม่ได้ แต่ยังแสดงในรายการตามจริง
  const drawn = slices.filter((s) => s.total > 0);
  const drawnSum = drawn.reduce((s, x) => s + x.total, 0);
  let offset = 0;

  return (
    <section aria-label="สัดส่วนรายจ่ายตามหมวด">
      <div className="relative mx-auto w-full max-w-[300px]">
        <svg
          viewBox="0 0 200 200"
          className="block w-full -rotate-90"
          role="img"
          aria-label={drawn.map((s) => `${s.label} ${pct(s.total)}%`).join(", ")}
        >
          {drawn.map((s) => {
            const len = (s.total / drawnSum) * CIRC;
            const gap = drawn.length > 1 ? GAP : 0;
            const circle = (
              <circle
                key={s.key}
                cx={100}
                cy={100}
                r={R}
                fill="none"
                strokeWidth={STROKE}
                className={s.color.stroke}
                strokeDasharray={`${Math.max(len - gap, 0)} ${CIRC}`}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return circle;
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
          <p className="text-xs text-brass">รวมทั้งหมด</p>
          <p className="text-2xl font-bold tabular-nums" title={`฿${baht(grand)}`}>
            ฿{whole(grand)}
          </p>
          <p className="mt-0.5 text-[11px] text-ink/45">{summary.receipts} ใบเสร็จ</p>
        </div>
      </div>

      <ul className="mt-8 divide-y divide-kraft/70">
        {slices.map((s) => (
          <LegendRow key={s.key} slice={s} pct={pct} />
        ))}
      </ul>
    </section>
  );
}

function LegendRow({ slice, pct }: { slice: Slice; pct: (n: number) => number }) {
  const [open, setOpen] = useState(false);
  const grouped = !!slice.members;

  const row = (
    <>
      <span className={`h-3 w-3 shrink-0 rounded-sm ${slice.color.swatch}`} aria-hidden />
      <span className="min-w-0 flex-1 truncate text-ink/75">
        {slice.label}
        {grouped && (
          <span className="ml-1 text-xs text-ink/40">{open ? "ซ่อน" : "ดูทั้งหมด"}</span>
        )}
      </span>
      <span className="w-12 text-right tabular-nums text-ink/50">{pct(slice.total)}%</span>
      <span className="w-20 text-right font-medium tabular-nums" title={`฿${baht(slice.total)}`}>
        {whole(slice.total)}
      </span>
    </>
  );

  return (
    <li className="py-4">
      {grouped ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={`flex w-full items-center gap-4 text-left text-sm ${focusRing}`}
        >
          {row}
        </button>
      ) : (
        <div className="flex items-center gap-4 text-sm">{row}</div>
      )}

      {grouped && open && (
        <ul className="mt-3 space-y-2 pl-7">
          {slice.members!.map((m) => (
            <li key={m.category} className="flex items-center gap-4 text-xs">
              <span className="min-w-0 flex-1 truncate text-ink/60">{m.category}</span>
              <span className="w-12 text-right tabular-nums text-ink/45">{pct(m.total)}%</span>
              <span className="w-20 text-right tabular-nums text-ink/70" title={`฿${baht(m.total)}`}>
                {whole(m.total)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {(slice.label === FALLBACK || slice.members?.some((m) => m.category === FALLBACK)) && (
        <p className="mt-1.5 pl-7 text-xs text-ink/40">
          {FALLBACK} รวม VAT ส่วนลด และของที่ยังไม่ได้เลือกหมวด
        </p>
      )}
    </li>
  );
}

// ---------------------------------------------------------------- ยอดรายวัน

function DailyChart({
  view,
  start,
  end,
  byDay,
}: {
  view: View;
  start: string;
  end: string;
  byDay: Map<string, number>;
}) {
  const span = daysBetween(start, end) + 1;
  // ช่วงยาวเกินสองเดือนแท่งจะแคบจนอ่านไม่ออก — ข้ามไปเลยดีกว่าแสดงแบบอ่านไม่ได้
  if (span > 62 || byDay.size === 0) return null;

  const days = Array.from({ length: span }, (_, i) => addDays(start, i));
  const max = Math.max(...days.map((d) => byDay.get(d) ?? 0), 0);
  const every = span <= 14 ? 1 : 7;

  return (
    <section className="border-t border-kraft pt-6">
      <h2 className="mb-4 text-sm font-medium text-ink/70">รายจ่ายรายวัน</h2>
      <div className="flex h-32 items-end gap-[3px]">
        {days.map((d, i) => {
          const v = byDay.get(d) ?? 0;
          const date = parseDate(d);
          return (
            <div
              key={d}
              className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
              title={`${date.getDate()} ${MONTHS_SHORT[date.getMonth()]} ฿${baht(v)}`}
            >
              <div
                className={`w-full rounded-t-sm ${v > 0 ? "bg-ink/70" : "bg-ink/10"}`}
                style={{ height: `${max > 0 ? (v / max) * 100 : 0}%`, minHeight: "2px" }}
              />
              <span className="h-3 text-[10px] tabular-nums leading-3 text-ink/40">
                {i % every === 0
                  ? view === "week"
                    ? WEEKDAYS[date.getDay()]
                    : date.getDate()
                  : ""}
              </span>
            </div>
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