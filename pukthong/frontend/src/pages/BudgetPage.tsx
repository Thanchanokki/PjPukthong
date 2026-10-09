import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type CSSProperties, type FormEvent, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { baht } from "../api";
import {
  type BudgetLine,
  CATEGORIES,
  copyBudget,
  fetchBudget,
  removeBudgetLimit,
  saveBudgetLimit,
} from "../budget";

/**
 * หน้างบประมาณ — ธีม "ม้วนใบเสร็จ" (paper/ink/stamp/ledger/kraft จาก tailwind.config)
 *
 * ส่วนสรุปด้านบนทำเป็นใบเสร็จขอบฉีก: บรรทัดงบ/ใช้ไป แล้วปิดท้ายด้วย "คงเหลือ"
 * ตัวใหญ่ตรงตำแหน่งยอดรวมของใบเสร็จจริง ส่วนรายการหมวดด้านล่างเรียบๆ ไม่แย่งความสนใจ
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

/** ค่าตั้งต้นตอนตั้งงบหมวดที่มีรายจ่ายอยู่แล้ว — ปัดยอดจริงขึ้นเป็นหลัก 500 */
const suggestLimit = (spent: number) =>
  spent > 0 ? String(Math.ceil(spent / 500) * 500) : "";

// ---------------------------------------------------------------- page

export default function BudgetPage() {
  const [params, setParams] = useSearchParams();
  const month = params.get("month") ?? toMonth(new Date());
  const qc = useQueryClient();
  /** หมวดที่กำลังแก้วงเงินอยู่ — เปิดได้ทีละหมวด */
  const [editing, setEditing] = useState<string | null>(null);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["budget", month],
    queryFn: () => fetchBudget(month),
  });

  const done = () => {
    setEditing(null);
    return qc.invalidateQueries({ queryKey: ["budget", month] });
  };

  const save = useMutation({
    mutationFn: (v: { category: string; limit: number }) =>
      saveBudgetLimit(month, v.category, v.limit),
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: (category: string) => removeBudgetLimit(month, category),
    onSuccess: done,
  });
  const copy = useMutation({
    mutationFn: () => copyBudget(shiftMonth(month, -1), month),
    onSuccess: done,
  });

  const goTo = (next: string) => {
    setEditing(null);
    setParams({ month: next });
  };

  const busy = save.isPending || remove.isPending || copy.isPending;
  const mutationError = (save.error ?? remove.error ?? copy.error) as Error | null;

  const lines = data?.lines ?? [];
  const budgeted = lines
    .filter((l) => l.limit !== null)
    .sort((a, b) => ratio(b) - ratio(a));
  const unbudgeted = lines
    .filter((l) => l.limit === null)
    .sort((a, b) => Number(b.spent) - Number(a.spent));
  const unused = CATEGORIES.filter((c) => !lines.some((l) => l.category === c));

  const totalLimit = sum(budgeted, "limit");
  const totalSpent = sum(budgeted, "spent");
  const outsideSpent = sum(unbudgeted, "spent");

  return (
    <div className="mx-auto max-w-xl space-y-6 text-ink">
      <header className="flex items-center gap-2">
        <h1 className="flex-1 text-2xl font-semibold">งบประมาณ</h1>
        <MonthSwitcher month={month} onChange={goTo} />
      </header>

      {isPending && <p className="text-sm text-ink/50">กำลังโหลด…</p>}
      {isError && <ErrorBox message={(error as Error).message} />}

      {data && (
        <>
          {budgeted.length > 0 ? (
            <ReceiptSummary
              limit={totalLimit}
              spent={totalSpent}
              outside={outsideSpent}
              daysLeft={daysLeftIn(month)}
            />
          ) : (
            <EmptyBudget
              month={month}
              busy={copy.isPending}
              onCopy={() => copy.mutate()}
            />
          )}

          {mutationError && <ErrorBox message={mutationError.message} />}

          {budgeted.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-medium text-ink/60">งบรายหมวด</h2>
              <ul className="divide-y divide-kraft overflow-hidden rounded-xl border border-kraft bg-white">
                {budgeted.map((line) => (
                  <BudgetRow
                    key={line.category}
                    line={line}
                    open={editing === line.category}
                    busy={busy}
                    onToggle={() =>
                      setEditing(editing === line.category ? null : line.category)
                    }
                    onSave={(limit) => save.mutate({ category: line.category, limit })}
                    onRemove={() => remove.mutate(line.category)}
                  />
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink/45">แตะที่หมวดเพื่อแก้วงเงิน</p>
            </section>
          )}

          {unbudgeted.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-medium text-ink/60">
                มีรายจ่ายแต่ยังไม่ได้ตั้งงบ
              </h2>
              <ul className="divide-y divide-kraft overflow-hidden rounded-xl border border-dashed border-kraft">
                {unbudgeted.map((line) => (
                  <UnbudgetedRow
                    key={line.category}
                    line={line}
                    open={editing === line.category}
                    busy={busy}
                    onOpen={() => setEditing(line.category)}
                    onCancel={() => setEditing(null)}
                    onSave={(limit) => save.mutate({ category: line.category, limit })}
                  />
                ))}
              </ul>
            </section>
          )}

          {unused.length > 0 && (
            <AddBudget
              categories={unused}
              busy={busy}
              onSave={(category, limit) => save.mutate({ category, limit })}
            />
          )}
        </>
      )}
    </div>
  );
}

const ratio = (l: BudgetLine) => Number(l.spent) / Math.max(Number(l.limit), 1);
const sum = (ls: BudgetLine[], key: "limit" | "spent") =>
  ls.reduce((acc, l) => acc + Number(l[key] ?? 0), 0);

// ---------------------------------------------------------------- ส่วนย่อย

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

/** ขอบล่างฉีกเป็นฟันเลื่อยแบบกระดาษใบเสร็จ (mask ใช้แค่ความโปร่งใส ไม่ใช่สีของธีม) */
const TORN_EDGE: CSSProperties = {
  WebkitMask:
    "conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) 50% / 14px 100%",
  mask: "conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) 50% / 14px 100%",
};

function ReceiptSummary({
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

  return (
    // drop-shadow อยู่ที่ตัวห่อ เพราะ mask จะตัดเงาของตัวมันเองทิ้ง
    <div className="drop-shadow-[0_1px_1px_rgba(33,29,23,0.12)]">
      <section
        aria-label="สรุปงบเดือนนี้"
        className="bg-paper px-5 pb-9 pt-5"
        style={TORN_EDGE}
      >
        <dl className="space-y-2 text-sm">
          <LedgerLine label="งบทั้งเดือน" value={limit} />
          <LedgerLine label="ใช้ไปแล้ว" value={spent} />
        </dl>

        <div
          className="mt-4 h-2 overflow-hidden rounded-full bg-ink/10"
          role="progressbar"
          aria-label="สัดส่วนที่ใช้ไปจากงบ"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
        >
          <div className={`h-full rounded-full ${TONE[tone].bar}`} style={{ width: `${pct}%` }} />
        </div>

        <div className="mt-4 border-t-[3px] border-double border-ink/70 pt-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium">{over ? "เกินงบ" : "คงเหลือ"}</span>
            <span
              className={`font-mono text-[2.5rem] font-bold leading-none tabular-nums ${
                over ? "text-stamp" : ""
              }`}
            >
              ฿{baht(Math.abs(remaining))}
            </span>
          </div>
          <p className="mt-2 text-right text-xs text-ink/60">
            {daysLeft === 0
              ? "เดือนนี้ปิดยอดแล้ว"
              : perDay !== null
                ? `ใช้ได้วันละ ฿${baht(perDay)} อีก ${daysLeft} วัน`
                : `เหลืออีก ${daysLeft} วัน ลองชะลอรายจ่ายหมวดที่เกินงบ`}
          </p>
        </div>

        {outside > 0 && (
          <p className="mt-4 border-t border-dashed border-kraft pt-3 text-xs text-ink/60">
            มีรายจ่ายในหมวดที่ยังไม่ได้ตั้งงบอีก{" "}
            <span className="font-mono tabular-nums">฿{baht(outside)}</span> ไม่ได้นับรวมด้านบน
          </p>
        )}
      </section>
    </div>
  );
}

/** บรรทัดแบบใบเสร็จ: ชื่อ ....... จำนวนเงิน */
function LedgerLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-ink/70">{label}</dt>
      <span aria-hidden className="flex-1 translate-y-[-3px] border-b border-dotted border-ink/25" />
      <dd className="font-mono tabular-nums">฿{baht(value)}</dd>
    </div>
  );
}

function EmptyBudget({
  month,
  busy,
  onCopy,
}: {
  month: string;
  busy: boolean;
  onCopy: () => void;
}) {
  return (
    <section className="rounded-xl bg-paper px-5 py-6">
      <h2 className="font-semibold">ยังไม่ได้ตั้งงบเดือน{monthLabel(month)}</h2>
      <p className="mt-1 text-sm text-ink/65">
        กำหนดวงเงินของแต่ละหมวด แล้วระบบจะเทียบกับรายจ่ายจากใบเสร็จให้ทุกครั้งที่บันทึก
      </p>
      <button
        type="button"
        onClick={onCopy}
        disabled={busy}
        className="mt-4 rounded-lg bg-stamp px-4 py-2 text-sm font-medium text-white hover:bg-stamp/90 disabled:opacity-50"
      >
        {busy ? "กำลังคัดลอก…" : `ใช้งบเดียวกับเดือน${monthLabel(shiftMonth(month, -1))}`}
      </button>
    </section>
  );
}

function BudgetRow({
  line,
  open,
  busy,
  onToggle,
  onSave,
  onRemove,
}: {
  line: BudgetLine;
  open: boolean;
  busy: boolean;
  onToggle: () => void;
  onSave: (limit: number) => void;
  onRemove: () => void;
}) {
  const limit = Number(line.limit);
  const spent = Number(line.spent);
  const tone = toneOf(spent, limit);
  const pct = limit > 0 ? Math.min(spent / limit, 1) * 100 : 100;
  const left = limit - spent;

  return (
    <li className={open ? "bg-paper/60" : ""}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="block w-full px-4 py-3.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-stamp"
      >
        <div className="flex items-baseline gap-3">
          <span className="min-w-0 flex-1 truncate font-medium">{line.category}</span>
          <span className="font-mono text-sm tabular-nums">
            ฿{baht(spent)}
            <span className="text-ink/40"> / {baht(limit)}</span>
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/10">
          <div className={`h-full rounded-full ${TONE[tone].bar}`} style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1.5 flex justify-between text-xs">
          <span className={TONE[tone].text}>
            {left >= 0 ? `เหลือ ฿${baht(left)}` : `เกินงบ ฿${baht(-left)}`}
          </span>
          <span className="text-ink/45">{line.count} ชิ้น</span>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4">
          <LimitEditor
            initial={String(limit)}
            busy={busy}
            onSave={onSave}
            onCancel={onToggle}
            onRemove={onRemove}
          />
        </div>
      )}
    </li>
  );
}

function UnbudgetedRow({
  line,
  open,
  busy,
  onOpen,
  onCancel,
  onSave,
}: {
  line: BudgetLine;
  open: boolean;
  busy: boolean;
  onOpen: () => void;
  onCancel: () => void;
  onSave: (limit: number) => void;
}) {
  return (
    <li className="px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{line.category}</p>
          <p className="text-xs text-ink/50">
            ใช้ไป <span className="font-mono tabular-nums">฿{baht(line.spent)}</span> จาก{" "}
            {line.count} ชิ้น
          </p>
        </div>
        {!open && (
          <button
            type="button"
            onClick={onOpen}
            className="rounded-lg border border-stamp/40 px-3 py-1.5 text-sm font-medium text-stamp hover:bg-stamp/5"
          >
            ตั้งงบ
          </button>
        )}
      </div>
      {open && (
        <LimitEditor
          initial={suggestLimit(Number(line.spent))}
          busy={busy}
          onSave={onSave}
          onCancel={onCancel}
        />
      )}
    </li>
  );
}

function AddBudget({
  categories,
  busy,
  onSave,
}: {
  categories: string[];
  busy: boolean;
  onSave: (category: string, limit: number) => void;
}) {
  const [category, setCategory] = useState("");

  return (
    <section>
      <label htmlFor="add-budget-category" className="mb-2 block text-sm font-medium text-ink/60">
        ตั้งงบหมวดอื่น
      </label>
      <select
        id="add-budget-category"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        className="w-full rounded-lg border border-kraft bg-white px-3 py-2 text-sm focus:border-stamp focus:outline-none focus:ring-1 focus:ring-stamp"
      >
        <option value="">เลือกหมวด</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      {category && (
        <LimitEditor
          key={category}
          initial=""
          busy={busy}
          onSave={(limit) => {
            onSave(category, limit);
            setCategory("");
          }}
          onCancel={() => setCategory("")}
        />
      )}
    </section>
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
          min={1}
          step={100}
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