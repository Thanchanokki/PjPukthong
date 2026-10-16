import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";

import { type Monthly, type ScanStats, type Transaction, baht, fetchMonthly, fetchScanStats } from "../api";
import { useAuth } from "../auth";
import { type BudgetLine, fetchBudget } from "../budget";
import {
  CalendarIcon,
  ChevronDownIcon,
  GearIcon,
  PersonIcon,
  PlusIcon,
  ReceiptIcon,
} from "../components/icons";

/**
 * หน้าแรกใหม่ — ภาพรวมเดือนนี้ (ทักทาย, สรุปรายจ่าย, รายการล่าสุด, งบประมาณ)
 * แทนหน้าเดิมที่เด้งเข้าตัวเลือกบันทึกใบเสร็จทันที — ตัวเลือกนั้นย้ายไปอยู่หลังปุ่มลอย
 * (FAB) มุมขวาล่าง กดแล้วพาไป /add (เนื้อหาเดิมของ CapturePage ไม่เปลี่ยน)
 *
 * ไม่มี "รายรับ/คงเหลือ" แล้ว — backend ตัดระบบรายรับออก เหลือไว้จะเป็นเลขจำลองที่
 * ไม่มีความหมายจริง ส่วนกรอบทองด้านบนใช้โชว์ยอดรายจ่ายเดือนนี้ (ข้อมูลจริงจาก backend)
 * เทียบกับงบที่ตั้งไว้ (budget.ts — ยังเป็นข้อมูลจำลอง ดูรายละเอียดที่ไฟล์นั้น)
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

/** จำนวนวันที่เหลือในเดือน นับวันนี้ด้วย — เดือนที่ผ่านไปแล้ว = 0 (เหมือน BudgetPage) */
function daysLeftIn(month: string): number {
  const now = new Date();
  const current = toMonth(now);
  const d = parseMonth(month);
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  if (month < current) return 0;
  if (month > current) return daysInMonth;
  return daysInMonth - now.getDate() + 1;
}

export default function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const month = params.get("month") ?? toMonth(new Date());

  const prevMonth = shiftMonth(month, -1);

  const monthly = useQuery({
    queryKey: ["monthly", month, "purchased"],
    queryFn: () => fetchMonthly(month, "purchased"),
  });
  /** ใช้เทียบเปอร์เซ็นต์เปลี่ยนแปลงกับเดือนก่อนในกรอบทอง — เงียบๆ ถ้าโหลดไม่ทันหรือพลาด */
  const prevMonthly = useQuery({
    queryKey: ["monthly", prevMonth, "purchased"],
    queryFn: () => fetchMonthly(prevMonth, "purchased"),
  });
  const scanStats = useQuery({ queryKey: ["scan-stats"], queryFn: fetchScanStats });
  const budget = useQuery({
    queryKey: ["budget", month],
    queryFn: () => fetchBudget(month),
  });

  const expense = Number(monthly.data?.expense_total ?? 0);
  const prevExpense = Number(prevMonthly.data?.expense_total ?? 0);
  const changePct = prevMonthly.isSuccess && prevExpense > 0
    ? Math.round(((expense - prevExpense) / prevExpense) * 100)
    : null;

  const topCategory = [...(monthly.data?.by_category ?? [])].sort(
    (a, b) => Number(b.total) - Number(a.total),
  )[0];

  const budgetedLines = (budget.data?.lines ?? []).filter((l) => l.limit !== null);
  const totalLimit = budgetedLines.length > 0
    ? budgetedLines.reduce((s, l) => s + Number(l.limit), 0)
    : null;
  /** หมวดที่ใกล้ครบงบ (≥80%) หรือเกินแล้ว — เรียงแย่สุดก่อน ใช้เตือนใต้กรอบทอง */
  const nearLimit = budgetedLines
    .filter((l) => Number(l.spent) / Math.max(Number(l.limit), 1) >= 0.8)
    .sort(
      (a, b) =>
        Number(b.spent) / Math.max(Number(b.limit), 1) -
        Number(a.spent) / Math.max(Number(a.limit), 1),
    );

  return (
    <div className="mx-auto max-w-xl space-y-6 pb-4 text-ink">
      <HomeHeader
        name={user?.name ?? "ผู้ใช้"}
        avatarUrl={user?.avatar_url}
        onSettings={() => navigate("/settings")}
      />

      <MonthField month={month} onChange={(m) => setParams({ month: m })} />

      <SpendHero
        spent={expense}
        limit={totalLimit}
        daysLeft={daysLeftIn(month)}
        changePct={changePct}
        topCategory={topCategory}
      />

      <ScanCountCard stats={scanStats.data} onScan={() => navigate("/add")} />

      {nearLimit.length > 0 && (
        <BudgetWarning lines={nearLimit} onOpen={() => navigate(`/budget?month=${month}`)} />
      )}

      <RecentTransactions
        month={month}
        pending={monthly.isPending}
        error={monthly.isError ? (monthly.error as Error).message : null}
        transactions={monthly.data?.transactions}
        onSeeAll={() => navigate(`/monthly?month=${month}`)}
        onAdd={() => navigate("/add")}
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

// ---------------------------------------------------------------- จำนวนใบเสร็จ

/** จำนวนใบเสร็จที่สแกนแล้วบันทึกเป็นรายการ — ทั้งหมด และเดือนนี้ (นับตามวันที่สแกน) */
function ScanCountCard({ stats, onScan }: { stats: ScanStats | undefined; onScan: () => void }) {
  return (
    <section className="flex items-center gap-4 rounded-xl border border-kraft bg-white p-4">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-mist text-pine">
        <ReceiptIcon className="h-6 w-6" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-ink/55">ใบเสร็จที่สแกนแล้ว</p>
        <p className="text-2xl font-bold tabular-nums">
          {stats ? stats.scanned_total.toLocaleString("th-TH") : "—"}
          <span className="ml-1 text-sm font-normal text-ink/55">ใบ</span>
        </p>
        <p className="text-xs text-ink/55">
          เดือนนี้ {stats ? stats.scanned_this_month.toLocaleString("th-TH") : "—"} ใบ
        </p>
      </div>
      <button type="button" onClick={onScan} className="btn shrink-0 bg-pine text-white hover:bg-pine-dark">
        สแกนเพิ่ม
      </button>
    </section>
  );
}

// ---------------------------------------------------------------- ส่วนบน

function HomeHeader({
  name,
  avatarUrl,
  onSettings,
}: {
  name: string;
  /** รูปโปรไฟล์ที่ตั้งไว้ในหน้าตั้งค่า — undefined/null = ยังไม่ได้ตั้ง ใช้ไอคอนคนแทน */
  avatarUrl?: string | null;
  onSettings: () => void;
}) {
  return (
    <header className="flex items-center gap-3">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          className="h-12 w-12 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-ink/10 text-ink/50">
          <PersonIcon className="h-6 w-6" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs text-ink/55">{greeting()}</p>
        <h1 className="truncate text-base font-bold">{name}</h1>
      </div>

      {/* เฟืองพาไปหน้าตั้งค่า — ออกจากระบบย้ายไปอยู่ในนั้นแล้ว */}
      <button
        type="button"
        onClick={onSettings}
        aria-label="ตั้งค่า"
        title="ตั้งค่า"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink/45 hover:bg-ink/5"
      >
        <GearIcon className="h-5 w-5" />
      </button>
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

// ---------------------------------------------------------------- สรุปรายจ่าย

type CategoryTotal = Monthly["by_category"][number];

/**
 * กรอบทอง — ของเดิมเคยเป็นการ์ดรายรับ/รายจ่าย/คงเหลือ แต่รายรับเป็นค่าจำลองที่ไม่มี
 * ความหมายจริง เปลี่ยนมาเน้นเลขเดียวที่สำคัญที่สุดของแอปสายรายจ่าย: ใช้ไปแล้วเท่าไหร่
 * เดือนนี้ พร้อม insight สั้นๆ 2 บรรทัด — หมวดที่ใช้เยอะสุด แล้วเทียบกับงบที่ตั้งไว้
 * (ไม่มีงบก็แค่ชวนไปตั้ง ไม่ฟ้องเป็นค่าลบลอยๆ) badge % มุมขวาบนเทียบกับเดือนก่อน
 */
function SpendHero({
  spent,
  limit,
  daysLeft,
  changePct,
  topCategory,
}: {
  spent: number;
  limit: number | null;
  daysLeft: number;
  changePct: number | null;
  topCategory: CategoryTotal | undefined;
}) {
  const remaining = limit !== null ? limit - spent : null;
  const over = remaining !== null && remaining < 0;
  const perDay = remaining !== null && !over && daysLeft > 0 ? remaining / daysLeft : null;

  const budgetLine =
    limit === null
      ? "ยังไม่ได้ตั้งงบเดือนนี้"
      : over
        ? `เกินงบที่ตั้งไว้ ฿${baht(-remaining!)}`
        : perDay !== null
          ? `เหลือในงบ ฿${baht(remaining!)} · วันละ ฿${baht(perDay)}`
          : `เหลือในงบ ฿${baht(remaining!)}`;

  return (
    <section
      aria-label="สรุปรายจ่ายเดือนนี้"
      className="rounded-2xl bg-gradient-to-br from-[#ECC87A] via-brass to-[#AD7D26] px-5 py-5 text-ink shadow-md shadow-brass/25"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-ink/70">ใช้จ่ายเดือนนี้</p>
        {changePct !== null && (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
              changePct > 0
                ? "bg-stamp/15 text-stamp"
                : changePct < 0
                  ? "bg-ledger/15 text-ledger"
                  : "bg-ink/10 text-ink/60"
            }`}
          >
            {changePct > 0 ? "+" : ""}
            {changePct}% จากเดือนก่อน
          </span>
        )}
      </div>

      <p className="mt-1 font-mono text-4xl font-bold leading-none tabular-nums">
        ฿{baht(spent)}
      </p>

      {topCategory && Number(topCategory.total) > 0 && (
        <p className="mt-2.5 text-sm text-ink/70">
          ใช้เยอะสุดกับ {topCategory.category} ฿{baht(topCategory.total)}
        </p>
      )}

      <p className={`mt-1 text-sm ${over ? "font-medium text-stamp" : "text-ink/70"}`}>
        {budgetLine}
      </p>
    </section>
  );
}

/** แถบเตือนหมวดที่ใกล้/เกินงบ — แตะพาไปหน้างบประมาณ กดดูรายละเอียดได้ทันที */
function BudgetWarning({
  lines,
  onOpen,
}: {
  lines: BudgetLine[];
  onOpen: () => void;
}) {
  const worst = lines[0];
  const worstOver = Number(worst.spent) > Number(worst.limit);
  const message =
    lines.length === 1
      ? `${worst.category} ${worstOver ? "เกินงบแล้ว" : "ใกล้ครบงบแล้ว"} ฿${baht(worst.spent)} / ฿${baht(worst.limit)}`
      : `มี ${lines.length} หมวดใกล้หรือเกินงบแล้ว เริ่มจาก${worst.category}`;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-2.5 rounded-xl border border-stamp/30 bg-stamp/5 px-4 py-3 text-left text-sm text-stamp hover:bg-stamp/10"
    >
      <span className="grid h-2 w-2 shrink-0 place-items-center rounded-full bg-stamp" aria-hidden />
      <span className="min-w-0 flex-1 truncate font-medium">{message}</span>
      <span className="shrink-0 text-xs text-stamp/70">ดูงบ ›</span>
    </button>
  );
}

// ---------------------------------------------------------------- รายการล่าสุด

function RecentTransactions({
  month,
  pending,
  error,
  transactions,
  onSeeAll,
  onAdd,
}: {
  month: string;
  pending: boolean;
  error: string | null;
  transactions: Transaction[] | undefined;
  onSeeAll: () => void;
  onAdd: () => void;
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
        <div className="px-4 pb-4">
          <p className="text-sm text-ink/50">ยังไม่มีรายการในเดือนนี้</p>
          <button
            type="button"
            onClick={onAdd}
            className="mt-2 rounded-lg border border-dashed border-stamp/40 px-3 py-1.5 text-sm font-medium text-stamp hover:bg-stamp/5"
          >
            + สแกนใบเสร็จแรกของเดือนนี้
          </button>
        </div>
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