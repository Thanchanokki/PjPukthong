import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";

import { type Transaction, fetchMonthly } from "../api";
import { useAuth } from "../auth";
import { type BudgetLine, budgetName, fetchBudget } from "../budget";
import { currentMonth, dayLabel as purchaseDayLabel, monthOf, monthShort, shiftMonth as shiftMonthBy } from "../dates";
import {
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

/** ฿ ไม่มีทศนิยม — หน้าแรกเน้นอ่านเร็ว ตัวเลขละเอียดดูได้ในหน้ารายการ */
const thb = (n: number) => `฿${Math.round(n).toLocaleString("th-TH")}`;

const daysIn = (month: string) => {
  const d = parseMonth(month);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
};

/** วันสุดท้ายที่นับยอดของเดือนนั้น: เดือนนี้ = วันนี้, เดือนที่ผ่านแล้ว = สิ้นเดือน, เดือนหน้า = 0 */
function cutoffDay(month: string): number {
  const current = toMonth(new Date());
  if (month < current) return daysIn(month);
  if (month > current) return 0;
  return new Date().getDate();
}

/** "1–25 พ.ย." หรือ "ทั้งเดือน ต.ค." */
function rangeLabel(month: string, day: number): string {
  const short = monthShort(month).split(" ")[0];
  return day >= daysIn(month) ? `ทั้งเดือน ${short}` : `1–${day} ${short}`;
}

/** เกณฑ์สีเดียวกันทั้งแอป (หน้างบ ป๊อปอัพเตือน): ถึง 80% = ใกล้ครบ, เกิน 100% = เกินงบ */
const toneOf = (ratio: number) => (ratio > 1 ? "over" : ratio >= 0.8 ? "near" : "ok");
const BAR = { over: "bg-stamp", near: "bg-brass", ok: "bg-ledger" } as const;

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

  /**
   * เทียบ "ช่วงเดียวกัน" ของเดือนก่อน — เดิมเอายอดถึงวันนี้ไปเทียบกับยอดทั้งเดือนของเดือนก่อน
   * ต้นเดือนจึงดูว่าใช้น้อยเสมอ และตัวเลขอย่าง +197% ไม่บอกว่าเทียบกับอะไร
   */
  const day = cutoffDay(month);
  const prevDay = day >= daysIn(month) ? daysIn(prevMonth) : Math.min(day, daysIn(prevMonth));
  const sumUpTo = (txs: Transaction[] | undefined, upTo: number) =>
    (txs ?? []).filter((t) => Number(t.purchased_at.slice(8, 10)) <= upTo).reduce((s, t) => s + Number(t.total), 0);
  const compare =
    monthly.isSuccess && prevMonthly.isSuccess && day > 0
      ? {
          now: sumUpTo(monthly.data.transactions, day),
          prev: sumUpTo(prevMonthly.data.transactions, prevDay),
          nowLabel: rangeLabel(month, day),
          prevLabel: rangeLabel(prevMonth, prevDay),
        }
      : null;

  const budgetedLines = (budget.data?.lines ?? []).filter((l) => l.limit !== null);
  const totalLimit = budgetedLines.length > 0
    ? budgetedLines.reduce((s, l) => s + Number(l.limit), 0)
    : null;
  return (
    // pb-28: เว้นที่ให้ปุ่ม + ลอย ไม่ให้บังการ์ดสุดท้าย
    <div className="mx-auto max-w-xl space-y-5 pb-28 text-ink">
      <HomeHeader
        name={user?.name ?? "ผู้ใช้"}
        avatarUrl={user?.avatar_url}
        onSettings={() => navigate("/settings")}
        month={month}
        onMonth={(m) => setParams({ month: m })}
      />

      <SpendHero
        spent={expense}
        limit={totalLimit}
        daysLeft={daysLeftIn(month)}
        range={day > 0 ? rangeLabel(month, day) : monthShort(month)}
      />

      {compare && <CompareCard {...compare} />}

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

      {/* ปุ่มลอยเพิ่มรายการ — พาไปหน้าเลือกสแกน/กรอกเอง (/add)
          ยึดขอบขวาของคอลัมน์เนื้อหา ไม่ใช่ขอบจอ จอกว้างจะได้ไม่ลอยห่างจากเนื้อหา */}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-20">
        <div className="mx-auto flex max-w-xl justify-end px-4">
          <button
            type="button"
            onClick={() => navigate("/add")}
            aria-label="เพิ่มรายการใหม่"
            className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-stamp
                       text-white shadow-lg shadow-stamp/30 transition hover:bg-stamp/90
                       focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
                       focus-visible:outline-stamp"
          >
            <PlusIcon className="h-7 w-7" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- ส่วนบน

function HomeHeader({
  name,
  avatarUrl,
  onSettings,
  month,
  onMonth,
}: {
  name: string;
  month: string;
  onMonth: (month: string) => void;
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
          className="h-10 w-10 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink/10 text-ink/50">
          <PersonIcon className="h-6 w-6" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs text-ink/55">{greeting()}</p>
        <h1 className="truncate text-base font-bold">{name}</h1>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => onMonth(shiftMonth(month, -1))}
          aria-label="เดือนก่อน"
          className="grid h-10 w-10 place-items-center rounded-xl border border-kraft bg-white"
        >
          <ChevronDownIcon className="h-4 w-4 rotate-90" />
        </button>
        <span className="min-w-[4.75rem] text-center text-sm font-bold">{monthShort(month)}</span>
        <button
          type="button"
          onClick={() => onMonth(shiftMonth(month, 1))}
          aria-label="เดือนถัดไป"
          className="grid h-10 w-10 place-items-center rounded-xl border border-kraft bg-white"
        >
          <ChevronDownIcon className="h-4 w-4 -rotate-90" />
        </button>
      </div>

      {/* เฟืองพาไปหน้าตั้งค่า — ออกจากระบบย้ายไปอยู่ในนั้นแล้ว */}
      <button
        type="button"
        onClick={onSettings}
        aria-label="ตั้งค่า"
        title="ตั้งค่า"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink/55 hover:bg-ink/5"
      >
        <GearIcon className="h-5 w-5" />
      </button>
    </header>
  );
}

// ---------------------------------------------------------------- สรุปรายจ่าย

/**
 * กรอบทอง — ยอดใช้จ่ายของเดือน พร้อมบอกช่วงวันที่ที่นับ และใช้ไปกี่ % ของงบรวม
 * สีแถบใช้เกณฑ์เดียวกับงบรายหมวด (80% = เหลือง, เกินงบ = แดง)
 */
function SpendHero({
  spent,
  limit,
  daysLeft,
  range,
}: {
  spent: number;
  limit: number | null;
  daysLeft: number;
  /** "1–25 พ.ย." — ช่วงวันที่ที่ยอดนี้นับ */
  range: string;
}) {
  const ratio = limit ? spent / limit : 0;
  const remaining = limit !== null ? limit - spent : null;
  const perDay = remaining !== null && remaining > 0 && daysLeft > 0 ? remaining / daysLeft : null;

  return (
    <section
      aria-label="สรุปรายจ่ายเดือนนี้"
      className="rounded-2xl bg-gradient-to-br from-[#ECC87A] via-brass to-[#AD7D26] px-5 py-5 text-ink shadow-md shadow-brass/25"
    >
      <p className="text-sm font-semibold text-ink/80">ใช้จ่ายเดือนนี้ · {range}</p>
      <p className="mt-1 font-mono text-4xl font-bold leading-none tabular-nums">{thb(spent)}</p>

      {limit === null ? (
        <p className="mt-3 text-sm text-ink/75">ยังไม่ได้ตั้งงบเดือนนี้</p>
      ) : (
        <>
          <div
            role="progressbar"
            aria-label="สัดส่วนที่ใช้ไปจากงบรวม"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(Math.round(ratio * 100), 100)}
            className="mt-3 h-2.5 overflow-hidden rounded-full bg-ink/15"
          >
            <div
              className={`h-full rounded-full ${ratio > 1 ? "bg-stamp" : ratio >= 0.8 ? "bg-[#8A5A0B]" : "bg-ledger"}`}
              style={{ width: `${Math.min(ratio * 100, 100)}%` }}
            />
          </div>
          <div className="mt-1.5 flex justify-between gap-3 text-sm">
            <span>
              ใช้ไป <strong>{Math.round(ratio * 100)}%</strong> ของงบ {thb(limit)}
            </span>
            <span className={remaining! < 0 ? "font-semibold text-stamp" : ""}>
              {remaining! < 0 ? "เกินงบ " : "เหลือ "}
              <strong>{thb(Math.abs(remaining!))}</strong>
            </span>
          </div>
          {perDay !== null && (
            <p className="mt-0.5 text-sm">
              ใช้ได้อีกวันละ <strong>{thb(perDay)}</strong> ถึงสิ้นเดือน ({daysLeft} วัน)
            </p>
          )}
        </>
      )}
    </section>
  );
}

/** เทียบกับช่วงเดียวกันของเดือนก่อน — โชว์ทั้งสองยอดและผลต่างเป็นเงิน ไม่ใช่ % ลอยๆ */
function CompareCard({
  now,
  prev,
  nowLabel,
  prevLabel,
}: {
  now: number;
  prev: number;
  nowLabel: string;
  prevLabel: string;
}) {
  const diff = now - prev;
  const times = prev > 0 && now / prev >= 1.5 ? ` (ประมาณ ${(now / prev).toFixed(now / prev >= 10 ? 0 : 1).replace(".0", "")} เท่า)` : "";
  const summary =
    prev === 0
      ? now === 0
        ? "ยังไม่มีรายจ่ายทั้งสองช่วง"
        : "ช่วงเดียวกันของเดือนก่อนยังไม่มีรายจ่าย"
      : Math.round(diff) === 0
        ? "ใช้เท่ากับเดือนก่อน"
        : diff > 0
          ? `▲ ใช้มากกว่า ${thb(diff)}${times}`
          : `▼ ใช้น้อยกว่า ${thb(-diff)}`;

  return (
    <section aria-label="เทียบกับเดือนก่อน" className="rounded-xl border border-kraft bg-white p-4">
      <h2 className="text-sm font-bold">เทียบกับช่วงเดียวกันของเดือนก่อน</h2>
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-paper px-3 py-2">
          <p className="text-xs text-ink/65">{prevLabel}</p>
          <p className="font-mono text-base font-bold tabular-nums">{thb(prev)}</p>
        </div>
        <div className="rounded-lg bg-paper px-3 py-2">
          <p className="text-xs text-ink/65">{nowLabel} (เดือนนี้)</p>
          <p className="font-mono text-base font-bold tabular-nums">{thb(now)}</p>
        </div>
      </div>
      <p
        className={`mt-2.5 text-sm font-semibold ${
          prev > 0 && diff > 0 ? "text-stamp" : prev > 0 && diff < 0 ? "text-ledger" : "text-ink/70"
        }`}
      >
        {summary}
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
                −{thb(Number(tx.total))}
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
  const budgeted = (data?.lines ?? []).filter((l) => l.limit !== null);
  const top = [...budgeted].sort((a, b) => ratio(b) - ratio(a)).slice(0, 3);
  const over = budgeted.filter((l) => ratio(l) > 1).length;
  const near = budgeted.filter((l) => ratio(l) >= 0.8).length;
  const summary =
    over > 0 ? `เกินงบแล้ว ${over} หมวด` : near > 0 ? `${near} หมวดใช้ถึง 80% แล้ว` : null;

  return (
    <section className="rounded-xl border border-kraft bg-white">
      <div className="flex items-center justify-between px-4 pt-3">
        <h2 className="text-sm font-bold">งบรายหมวด</h2>
        <button type="button" onClick={onSeeAll} className="min-h-[32px] text-xs font-medium text-stamp">
          ดูทั้งหมด
        </button>
      </div>
      {summary && (
        <p className={`px-4 text-xs font-semibold ${over > 0 ? "text-stamp" : "text-[#7A5410]"}`}>{summary}</p>
      )}

      {pending && <p className="px-4 py-3 text-sm text-ink/60">กำลังโหลด…</p>}
      {error && <p className="px-4 py-3 text-sm text-stamp">{error}</p>}

      {!pending && !error && top.length === 0 && (
        <div className="px-4 pb-4 pt-2">
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
        <>
          <ul className="space-y-3 px-4 pb-3 pt-3">
            {top.map((l) => {
              const spent = Number(l.spent);
              const limit = Number(l.limit);
              const r = ratio(l);
              const tone = toneOf(r);
              return (
                <li key={l.category_id}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate font-semibold">
                      {budgetName(data!.axis, l.category_id, l.category)}
                    </span>
                    <span className={`shrink-0 ${tone === "over" ? "text-stamp" : ""}`}>
                      {tone === "over" ? "เกิน " : "เหลือ "}
                      <strong>{thb(Math.abs(limit - spent))}</strong>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink/10">
                    <div className={`h-full rounded-full ${BAR[tone]}`} style={{ width: `${Math.min(r * 100, 100)}%` }} />
                  </div>
                  <p className="mt-0.5 font-mono text-[11px] tabular-nums text-ink/65">
                    {thb(spent)} / {thb(limit)} · {Math.round(r * 100)}%
                  </p>
                </li>
              );
            })}
          </ul>
          <p className="border-t border-kraft/70 px-4 py-2.5 text-[11px] text-ink/65">
            สีแถบ: เขียว = ปกติ · เหลือง = ใช้ถึง 80% · แดง = เกินงบ
          </p>
        </>
      )}
    </section>
  );
}
