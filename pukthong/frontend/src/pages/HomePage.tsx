import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";

import { type Monthly, type Transaction, baht, fetchMonthly } from "../api";
import { useAuth } from "../auth";
import { type BudgetLine, budgetName, fetchBudget } from "../budget";
import { currentMonth, dayLabel as purchaseDayLabel, monthOf, monthShort, shiftMonth as shiftMonthBy } from "../dates";
import {
  CalendarIcon,
  ChevronDownIcon,
  GearIcon,
  PersonIcon,
  PlusIcon,
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
  /**
   * "เพิ่งบันทึก" ใช้เดือนที่สแกน/บันทึก (uploaded) ของเดือนนี้กับเดือนก่อน ไม่ใช่เดือนที่ซื้อ —
   * ใบเก่าที่เพิ่งสแกนต้องขึ้นบนสุด ไม่งั้นผู้ใช้หาสิ่งที่เพิ่งทำไม่เจอ (ยอดเงินยังนับตามวันที่ซื้อ)
   */
  const nowMonth = currentMonth();
  const recentNow = useQuery({
    queryKey: ["monthly", nowMonth, "uploaded"],
    queryFn: () => fetchMonthly(nowMonth, "uploaded"),
  });
  const recentPrev = useQuery({
    queryKey: ["monthly", shiftMonthBy(nowMonth, -1), "uploaded"],
    queryFn: () => fetchMonthly(shiftMonthBy(nowMonth, -1), "uploaded"),
  });
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
  return (
    // pb-28: เว้นที่ให้ปุ่ม + ลอย ไม่ให้บังการ์ดสุดท้าย
    <div className="mx-auto max-w-xl space-y-6 pb-28 text-ink">
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

      <BudgetWidget
        pending={budget.isPending}
        error={budget.isError ? (budget.error as Error).message : null}
        data={budget.data}
        onSeeAll={() => navigate(`/budget?month=${month}`)}
        onSetup={() => navigate(`/budget/new?month=${month}&by=merchant`)}
      />

      <RecentTransactions
        month={month}
        pending={recentNow.isPending}
        error={recentNow.isError ? (recentNow.error as Error).message : null}
        transactions={[...(recentNow.data?.transactions ?? []), ...(recentPrev.data?.transactions ?? [])]}
        onSeeAll={() => navigate(`/monthly?month=${month}`)}
        onAdd={() => navigate("/add")}
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
        <p className="text-sm font-medium text-ink/70">ใช้จ่ายเดือนนี้ <span className="text-xs font-normal">(ตามวันที่ซื้อ)</span></p>
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

      {limit !== null && limit > 0 && (
        <div
          role="progressbar"
          aria-label="สัดส่วนที่ใช้ไปจากงบ"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(Math.round((spent / limit) * 100), 100)}
          className="mt-3 h-2 overflow-hidden rounded-full bg-ink/15"
        >
          <div
            className={`h-full rounded-full ${over ? "bg-stamp" : "bg-ledger"}`}
            style={{ width: `${Math.min((spent / limit) * 100, 100)}%` }}
          />
        </div>
      )}

      <p className={`mt-2 text-sm ${over ? "font-semibold text-stamp" : "text-ink/70"}`}>
        {budgetLine}
      </p>
    </section>
  );
}

// ---------------------------------------------------------------- รายการล่าสุด

/** "ซื้อวันนี้" · "ซื้อเมื่อวาน" · "ซื้อ จ. 17 พ.ย. 69" */
const purchasedText = (date: string) => {
  const label = purchaseDayLabel(date);
  return label === "วันนี้" || label === "เมื่อวาน" ? `ซื้อ${label}` : `ซื้อ ${label}`;
};

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
  // บันทึกล่าสุดก่อน — uploaded_at เป็น ISO datetime เทียบ lexical ได้ตรงๆ
  const recent = [...(transactions ?? [])]
    .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at) || b.created_at.localeCompare(a.created_at))
    .slice(0, 3);
  const nowMonth = currentMonth();

  return (
    <section className="rounded-xl border border-kraft bg-white">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-sm font-bold">เพิ่งบันทึก</h2>
        <button type="button" onClick={onSeeAll} className="text-xs font-medium text-stamp">
          ดูทั้งหมด
        </button>
      </div>

      {pending && <p className="px-4 pb-4 text-sm text-ink/50">กำลังโหลด…</p>}
      {error && <p className="px-4 pb-4 text-sm text-stamp">{error}</p>}

      {!pending && !error && recent.length === 0 && (
        <div className="px-4 pb-4">
          <p className="text-sm text-ink/60">ยังไม่มีรายการที่บันทึกล่าสุด</p>
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
                <p className="text-xs text-ink/65">
                  {purchasedText(tx.purchased_at)}
                  {tx.purchased_time && ` · ${tx.purchased_time.slice(0, 5)} น.`}
                  {tx.category && ` · ${tx.category}`}
                </p>
                {monthOf(tx.purchased_at) !== nowMonth && (
                  <span className="mt-1 inline-block rounded-full bg-brass/25 px-2 py-0.5 text-[11px] font-medium text-ink">
                    นับในยอดเดือน {monthShort(monthOf(tx.purchased_at))}
                  </span>
                )}
              </div>
              <span className="shrink-0 tabular-nums font-semibold text-stamp">
                −฿{baht(tx.total)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- งบประมาณ

type Budget = Awaited<ReturnType<typeof fetchBudget>>;

/**
 * งบรายหมวดแบบแถบ — แทนโดนัทเดิมที่ชื่อหมวดยาวจนล้นการ์ด และรวมแถบเตือนหมวดเกินงบไว้ในตัว
 * โชว์ 3 หมวดที่ใช้ไปเป็นสัดส่วนสูงสุด (เกินงบขึ้นก่อน) ดูครบที่หน้างบประมาณ
 */
function BudgetWidget({
  pending,
  error,
  data,
  onSeeAll,
  onSetup,
}: {
  pending: boolean;
  error: string | null;
  data: Budget | undefined;
  onSeeAll: () => void;
  onSetup: () => void;
}) {
  const ratio = (l: BudgetLine) => Number(l.spent) / Math.max(Number(l.limit), 1);
  const top = [...(data?.lines ?? [])]
    .filter((l) => l.limit !== null)
    .sort((a, b) => ratio(b) - ratio(a))
    .slice(0, 3);

  return (
    <section className="rounded-xl border border-kraft bg-white">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-sm font-bold">งบรายหมวด</h2>
        <button type="button" onClick={onSeeAll} className="text-xs font-medium text-stamp">
          ดูทั้งหมด
        </button>
      </div>

      {pending && <p className="px-4 pb-4 text-sm text-ink/60">กำลังโหลด…</p>}
      {error && <p className="px-4 pb-4 text-sm text-stamp">{error}</p>}

      {!pending && !error && top.length === 0 && (
        <div className="px-4 pb-4">
          <p className="text-sm text-ink/60">ยังไม่ได้ตั้งงบเดือนนี้</p>
          <button
            type="button"
            onClick={onSetup}
            className="mt-2 rounded-lg border border-dashed border-stamp/40 px-3 py-1.5 text-sm font-medium text-stamp hover:bg-stamp/5"
          >
            + ตั้งงบหมวดแรก
          </button>
        </div>
      )}

      {!pending && !error && top.length > 0 && (
        <ul className="space-y-3.5 px-4 pb-4">
          {top.map((l) => {
            const spent = Number(l.spent);
            const limit = Number(l.limit);
            const over = spent > limit;
            const near = !over && spent / Math.max(limit, 1) >= 0.8;
            return (
              <li key={l.category_id}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-semibold">
                    {budgetName(data!.axis, l.category_id, l.category)}
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-ink/75">
                    ฿{baht(spent)} / {baht(limit)}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink/10">
                  <div
                    className={`h-full rounded-full ${over ? "bg-stamp" : near ? "bg-brass" : "bg-ledger"}`}
                    style={{ width: `${Math.min((spent / Math.max(limit, 1)) * 100, 100)}%` }}
                  />
                </div>
                <p className={`mt-1 text-xs ${over ? "font-semibold text-stamp" : "text-ink/65"}`}>
                  {over ? `เกินงบ ฿${baht(spent - limit)}` : `เหลือ ฿${baht(limit - spent)}`}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
