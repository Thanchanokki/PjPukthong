import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";

import { type Monthly, type Transaction, baht, fetchMonthly } from "../api";
import { useAuth } from "../auth";
import { fetchBudget } from "../budget";
import {
  CalendarIcon,
  ChevronDownIcon,
  GearIcon,
  PersonIcon,
  PlusIcon,
} from "../components/icons";
import { mockIncomeFor } from "../income";

/**
 * หน้าแรกใหม่ — ภาพรวมเดือนนี้ (ทักทาย, รายรับ/รายจ่าย/คงเหลือ, รายการล่าสุด, งบประมาณ)
 * แทนหน้าเดิมที่เด้งเข้าตัวเลือกบันทึกใบเสร็จทันที — ตัวเลือกนั้นย้ายไปอยู่หลังปุ่มลอย
 * (FAB) มุมขวาล่าง กดแล้วพาไป /add (เนื้อหาเดิมของ CapturePage ไม่เปลี่ยน)
 *
 * ⚠️ "รายรับ" เป็นค่าจำลองทั้งหมด (ดู income.ts) เพราะ backend ตัดระบบรายรับออกไปแล้ว
 * "งบประมาณเดือนนี้" ดึงจาก budget.ts ซึ่งตอนนี้ก็ยังเป็นข้อมูลจำลองเช่นกัน
 * (ดูรายละเอียดที่ไฟล์นั้น) ส่วน "รายจ่าย" และ "รายการล่าสุด" เป็นข้อมูลจริงจาก backend
 */

const pad = (n: number) => String(n).padStart(2, "0");
const toMonth = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const parseMonth = (s: string) => {
  const [y, m] = s.split("-").map(Number);
  return new Date(y, m - 1, 1);
};
const shiftMonth = (month: string, n: number) => {
  const d = parseMonth(month);
  return toMonth(new Date(d.getFullYear(), d.getMonth() + n, 1));
};

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
const monthLabel = (month: string) => {
  const d = parseMonth(month);
  return `${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
};

/** วันนี้ / เมื่อวาน / dd เดือนย่อ — ใช้บอกว่ารายการล่าสุดเกิดขึ้นเมื่อไหร่ */
const MONTHS_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];
function dayLabel(dateStr: string): string {
  const now = new Date();
  const todayStr = toMonth(now) + "-" + pad(now.getDate());
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  const yesterdayStr = toMonth(y) + "-" + pad(y.getDate());
  if (dateStr === todayStr) return "วันนี้";
  if (dateStr === yesterdayStr) return "เมื่อวาน";
  const d = new Date(dateStr);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/** สวัสดีตอนเช้า/บ่าย/เย็น ตามเวลาปัจจุบันของเครื่อง */
function greeting(): string {
  const h = new Date().getHours();
  if (h < 11) return "สวัสดีตอนเช้า";
  if (h < 17) return "สวัสดีตอนบ่าย";
  return "สวัสดีตอนเย็น";
}

export default function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const month = params.get("month") ?? toMonth(new Date());

  const monthly = useQuery({
    queryKey: ["monthly", month, "purchased"],
    queryFn: () => fetchMonthly(month, "purchased"),
  });
  const budget = useQuery({
    // ใช้แกนเดียวกับค่าเริ่มต้นของหน้างบ (ตามประเภทร้าน) การ์ดนี้กับหน้างบจะได้ตรงกัน
    queryKey: ["budget", month, "merchant"],
    queryFn: () => fetchBudget(month, "merchant"),
  });

  const expense = Number(monthly.data?.expense_total ?? 0);
  const income = mockIncomeFor(month);
  const balance = income - expense;

  return (
    <div className="mx-auto max-w-xl space-y-6 pb-4 text-ink">
      <HomeHeader name={user?.name ?? "ผู้ใช้"} />

      <MonthField month={month} onChange={(m) => setParams({ month: m })} />

      <StatRow income={income} expense={expense} balance={balance} />

      <RecentTransactions
        month={month}
        pending={monthly.isPending}
        error={monthly.isError ? (monthly.error as Error).message : null}
        transactions={monthly.data?.transactions}
        onSeeAll={() => navigate(`/monthly?month=${month}`)}
      />

      <BudgetWidget
        pending={budget.isPending}
        error={budget.isError ? (budget.error as Error).message : null}
        data={budget.data}
        onSeeAll={() => navigate(`/budget?month=${month}`)}
      />

      {/* ปุ่มลอยเพิ่มรายการ — พาไปหน้าเดิมที่เคยเป็นหน้าแรก (ถ่ายภาพ/อัพโหลด/กรอกเอง) */}
      <button
        type="button"
        onClick={() => navigate("/add")}
        aria-label="เพิ่มรายการใหม่"
        className="fixed bottom-24 right-5 z-20 flex h-14 w-14 items-center justify-center
                   rounded-full bg-stamp text-white shadow-lg shadow-stamp/30 transition
                   hover:bg-stamp/90 focus-visible:outline focus-visible:outline-2
                   focus-visible:outline-offset-2 focus-visible:outline-stamp"
      >
        <PlusIcon className="h-7 w-7" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- ส่วนบน

function HomeHeader({ name }: { name: string }) {
  return (
    <header className="flex items-center gap-3">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-ink/10 text-ink/50">
        <PersonIcon className="h-6 w-6" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-ink/55">{greeting()}</p>
        <div className="flex items-center gap-1.5">
          <h1 className="truncate text-base font-bold">{name}</h1>
          {/* ยังไม่มีหน้าตั้งค่าโปรไฟล์จริง — ใส่ไว้ก่อนแบบกดไม่ได้ */}
          <GearIcon className="h-4 w-4 shrink-0 text-ink/35" aria-hidden />
        </div>
      </div>
    </header>
  );
}

function MonthField({
  month,
  onChange,
}: {
  month: string;
  onChange: (month: string) => void;
}) {
  return (
    <label className="relative inline-flex items-center gap-2 rounded-full border border-kraft bg-white py-2 pl-3.5 pr-3 text-sm font-medium">
      <CalendarIcon className="h-4 w-4 text-ink/45" />
      <span>{monthLabel(month)}</span>
      <ChevronDownIcon className="h-4 w-4 text-ink/35" />
      {/* input จริงซ้อนโปร่งใสทับทั้งก้อน — คลิกตรงไหนก็เปิด picker ของเบราว์เซอร์
          ส่วนข้อความที่เห็นเป็นป้ายไทยที่เราจัดรูปแบบเอง ไม่ใช่สิ่งที่ input แสดง */}
      <input
        type="month"
        value={month}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        aria-label="เลือกเดือน"
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </label>
  );
}

// ---------------------------------------------------------------- สถิติ

function StatRow({
  income,
  expense,
  balance,
}: {
  income: number;
  expense: number;
  balance: number;
}) {
  const Card = ({
    label,
    value,
    tone,
  }: {
    label: string;
    value: string;
    tone: "income" | "expense" | "balance";
  }) => (
    <div className="flex-1 rounded-xl border border-kraft bg-white px-3 py-3">
      <p className="text-xs text-ink/55">{label}</p>
      <p
        className={`mt-1 truncate text-lg font-bold tabular-nums ${
          tone === "income" ? "text-ledger" : tone === "expense" ? "text-stamp" : "text-ink"
        }`}
      >
        {value}
      </p>
    </div>
  );

  return (
    <div className="flex gap-2.5">
      <Card label="รายรับ" value={`+${baht(income)}`} tone="income" />
      <Card label="รายจ่าย" value={`-${baht(expense)}`} tone="expense" />
      <Card label="คงเหลือ" value={baht(balance)} tone="balance" />
    </div>
  );
}

// ---------------------------------------------------------------- รายการล่าสุด

function RecentTransactions({
  month,
  pending,
  error,
  transactions,
  onSeeAll,
}: {
  month: string;
  pending: boolean;
  error: string | null;
  transactions: Transaction[] | undefined;
  onSeeAll: () => void;
}) {
  void month;
  // ใหม่สุดก่อน — purchased_at เรียงเป็น string 'YYYY-MM-DD' เทียบ lexical ได้ตรงๆ
  // purchased_time อาจเป็น null จึงต้องกันไว้ตอนเทียบรอง
  const recent = [...(transactions ?? [])]
    .sort((a, b) => {
      const byDate = b.purchased_at.localeCompare(a.purchased_at);
      if (byDate !== 0) return byDate;
      return (b.purchased_time ?? "").localeCompare(a.purchased_time ?? "");
    })
    .slice(0, 3);

  return (
    <section className="rounded-xl border border-kraft bg-white">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-sm font-bold">รายการล่าสุด</h2>
        <button type="button" onClick={onSeeAll} className="text-xs font-medium text-stamp">
          ดูทั้งหมด
        </button>
      </div>

      {pending && <p className="px-4 pb-4 text-sm text-ink/50">กำลังโหลด…</p>}
      {error && <p className="px-4 pb-4 text-sm text-stamp">{error}</p>}

      {!pending && !error && recent.length === 0 && (
        <p className="px-4 pb-4 text-sm text-ink/50">ยังไม่มีรายการในเดือนนี้</p>
      )}

      {!pending && !error && recent.length > 0 && (
        <ul className="divide-y divide-kraft/70 border-t border-kraft">
          {recent.map((tx) => (
            <li key={tx.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {tx.merchant_name ?? "(ไม่ระบุร้าน)"}
                </p>
                <p className="text-xs text-ink/50">
                  {dayLabel(tx.purchased_at)}
                  {tx.purchased_time && ` ${tx.purchased_time.slice(0, 5)}`}
                  {tx.category && ` · ${tx.category}`}
                </p>
              </div>
              <span className="shrink-0 tabular-nums font-semibold text-stamp">
                -{baht(tx.total)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- งบประมาณ

const R = 44;
const STROKE = 16;
const CIRC = 2 * Math.PI * R;
const GAP = 3;
/** สีเดียวกับโดนัทในหน้ารายงาน (stamp/brass/ledger) — ให้สองหน้าดูเป็นระบบเดียวกัน */
const SLICE_COLOR = ["stroke-stamp", "stroke-brass", "stroke-ledger"];
const DOT_COLOR = ["bg-stamp", "bg-brass", "bg-ledger"];

type Budget = Awaited<ReturnType<typeof fetchBudget>>;

function BudgetWidget({
  pending,
  error,
  data,
  onSeeAll,
}: {
  pending: boolean;
  error: string | null;
  data: Budget | undefined;
  onSeeAll: () => void;
}) {
  // เอาเฉพาะหมวดที่ตั้งงบไว้แล้ว เรียงยอดใช้จริงมากไปน้อย โชว์ 3 หมวดแรกให้ไม่รก
  // เหมือนภาพรวม ดูละเอียดทั้งหมดได้ที่หน้างบประมาณ
  const top = [...(data?.lines ?? [])]
    .filter((l) => l.limit !== null)
    .sort((a, b) => Number(b.spent) - Number(a.spent))
    .slice(0, 3);
  const total = top.reduce((s, l) => s + Number(l.spent), 0);

  return (
    <section className="rounded-xl border border-kraft bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold">งบประมาณเดือนนี้</h2>
        <button type="button" onClick={onSeeAll} className="text-xs font-medium text-stamp">
          ดูทั้งหมด
        </button>
      </div>

      {pending && <p className="mt-3 text-sm text-ink/50">กำลังโหลด…</p>}
      {error && <p className="mt-3 text-sm text-stamp">{error}</p>}

      {!pending && !error && top.length === 0 && (
        <p className="mt-3 text-sm text-ink/50">ยังไม่ได้ตั้งงบเดือนนี้</p>
      )}

      {!pending && !error && top.length > 0 && (
        <div className="mt-4 flex items-center gap-5">
          <svg viewBox="0 0 110 110" className="h-24 w-24 shrink-0 -rotate-90">
            {(() => {
              let offset = 0;
              return top.map((l, i) => {
                const value = Number(l.spent);
                const len = total > 0 ? (value / total) * CIRC : 0;
                const gap = top.length > 1 ? GAP : 0;
                const circle = (
                  <circle
                    key={l.category}
                    cx={55}
                    cy={55}
                    r={R}
                    fill="none"
                    strokeWidth={STROKE}
                    className={SLICE_COLOR[i % SLICE_COLOR.length]}
                    strokeDasharray={`${Math.max(len - gap, 0)} ${CIRC}`}
                    strokeDashoffset={-offset}
                  />
                );
                offset += len;
                return circle;
              });
            })()}
          </svg>

          <ul className="flex-1 space-y-2">
            {top.map((l, i) => (
              <li key={l.category} className="flex items-center gap-2 text-sm">
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT_COLOR[i % DOT_COLOR.length]}`}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-ink/75">{l.category}</span>
                <span className="shrink-0 tabular-nums font-medium">{baht(l.spent)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}