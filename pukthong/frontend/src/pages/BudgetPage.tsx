import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type CSSProperties, type FormEvent, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { type Transaction, baht, fetchMonthly } from "../api";
import {
  type BudgetAxis,
  type BudgetLine,
  type BudgetOption,
  copyBudget,
  fetchBudget,
  removeBudgetLimit,
  saveBudgetLimit,
} from "../budget";
import { FALLBACK, labelOf } from "../categories";
import { type BudgetItem, BudgetItemsDialog } from "../components/BudgetItemsDialog";

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
  /** แกนของงบ — ค่าเริ่มต้นคือตามประเภทร้าน (เก็บใน URL ให้ refresh แล้วอยู่แท็บเดิม) */
  const axis: BudgetAxis = params.get("by") === "item" ? "item" : "merchant";
  const qc = useQueryClient();
  /** หมวดที่กำลังแก้วงเงินอยู่ — เปิดได้ทีละหมวด */
  const [editing, setEditing] = useState<string | null>(null);
  /** หมวดที่เปิดป๊อปอัพดูรายการสินค้าอยู่ */
  const [detail, setDetail] = useState<BudgetLine | null>(null);
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
    setParams({ month, by: next });
  };
  // นับเป็นรายการสินค้าทั้งสองแกน — ตรงกับ "รวม N รายการ" ในป๊อปอัพ
  const unit = "รายการ";

  const busy = save.isPending || remove.isPending || copy.isPending;
  const mutationError = (save.error ?? remove.error ?? copy.error) as Error | null;

  const lines = data?.lines ?? [];
  const budgeted = lines
    .filter((l) => l.limit !== null)
    .sort((a, b) => ratio(b) - ratio(a));
  const unbudgeted = lines
    .filter((l) => l.limit === null)
    .sort((a, b) => Number(b.spent) - Number(a.spent));
  // ดรอปดาวน์แสดงทุกตัวเลือกของแกนนั้น รวมที่อยู่ในรายการด้านบนแล้วด้วย (เลือกซ้ำ = แก้วงเงิน)
  // แกนสินค้า backend ส่งมาเฉพาะหมวดหลัก — ยอดของหมวดย่อยรวมอยู่ในหมวดหลักแล้ว
  const options = data?.options ?? [];

  const totalLimit = sum(budgeted, "limit");
  const totalSpent = sum(budgeted, "spent");
  const outsideSpent = sum(unbudgeted, "spent");

  return (
    <div className="mx-auto max-w-xl space-y-6 text-ink">
      <header className="flex items-center gap-2">
        <h1 className="flex-1 text-2xl font-semibold">งบประมาณ</h1>
        <MonthSwitcher month={month} onChange={goTo} />
      </header>

      <AxisTabs value={axis} onChange={switchAxis} />

      {detail && (
        <BudgetItemsDialog
          title={labelOf({ name: detail.category, icon: detail.icon })}
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
              onCopy={canCopy ? () => copy.mutate() : null}
            />
          )}

          {mutationError && <ErrorBox message={mutationError.message} />}

          {budgeted.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-medium text-ink/60">งบรายหมวด</h2>
              <ul className="divide-y divide-kraft overflow-hidden rounded-xl border border-kraft bg-white">
                {budgeted.map((line) => (
                  <BudgetRow
                    key={line.category_id}
                    line={line}
                    unit={unit}
                    open={editing === line.category_id}
                    busy={busy}
                    onToggle={() =>
                      editing === line.category_id ? setEditing(null) : setDetail(line)
                    }
                    onSave={(limit) => save.mutate({ categoryId: line.category_id, limit })}
                    onRemove={() => remove.mutate(line.category_id)}
                  />
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink/45">แตะที่หมวดเพื่อดูรายการที่สแกนมาและแก้วงเงิน</p>
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
                    key={line.category_id}
                    line={line}
                    unit={unit}
                    open={editing === line.category_id}
                    busy={busy}
                    onOpen={() => setEditing(line.category_id)}
                    onCancel={() => setEditing(null)}
                    onSave={(limit) => save.mutate({ categoryId: line.category_id, limit })}
                  />
                ))}
              </ul>
            </section>
          )}

          {options.length > 0 && (
            <AddBudget
              label={axis === "merchant" ? "ตั้งงบตามประเภทร้าน" : "ตั้งงบตามหมวดสินค้า"}
              categories={options}
              lines={lines}
              busy={busy}
              onSave={(categoryId, limit) => save.mutate({ categoryId, limit })}
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

/** สลับงบ "ตามประเภทร้าน" กับ "ตามหมวดสินค้า" — งบสองแบบแยกกันคนละชุด */
function AxisTabs({ value, onChange }: { value: BudgetAxis; onChange: (v: BudgetAxis) => void }) {
  const tabs: { id: BudgetAxis; label: string; hint: string }[] = [
    { id: "merchant", label: "ตามประเภทร้าน", hint: "" },
    { id: "item", label: "ตามหมวดสินค้า", hint: "" },
  ];
  return (
    <div>
      <div role="tablist" className="grid grid-cols-2 gap-1 rounded-xl bg-ink/5 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={value === t.id}
            onClick={() => onChange(t.id)}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
              value === t.id ? "bg-white text-ink shadow-sm" : "text-ink/55 hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-center text-xs text-ink/45">
        {tabs.find((t) => t.id === value)!.hint}
      </p>
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
  /** null = เดือนก่อนไม่มีงบให้คัดลอก จึงไม่แสดงปุ่ม */
  onCopy: (() => void) | null;
}) {
  return (
    <section className="rounded-xl bg-paper px-5 py-6">
      <h2 className="font-semibold">ยังไม่ได้ตั้งงบเดือน{monthLabel(month)}</h2>
      <p className="mt-1 text-sm text-ink/65">
        เลือกหมวดใน "ตั้งงบหมวดอื่น" ด้านล่าง หรือกด "ตั้งงบ" ที่หมวดที่มีรายจ่ายแล้ว
        จากนั้นระบบจะเทียบกับรายจ่ายจากใบเสร็จให้ทุกครั้งที่บันทึก
      </p>
      {onCopy && (
        <button
          type="button"
          onClick={onCopy}
          disabled={busy}
          className="mt-4 rounded-lg bg-stamp px-4 py-2 text-sm font-medium text-white hover:bg-stamp/90 disabled:opacity-50"
        >
          {busy ? "กำลังคัดลอก…" : `ใช้งบเดียวกับเดือน${monthLabel(shiftMonth(month, -1))}`}
        </button>
      )}
    </section>
  );
}

function BudgetRow({
  line,
  unit,
  open,
  busy,
  onToggle,
  onSave,
  onRemove,
}: {
  line: BudgetLine;
  /** หน่วยที่ต่อท้ายจำนวน ("รายการ") */
  unit: string;
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
        aria-haspopup="dialog"
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
          <span className="text-ink/45">{line.count} {unit}</span>
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
  unit,
  open,
  busy,
  onOpen,
  onCancel,
  onSave,
}: {
  line: BudgetLine;
  /** หน่วยที่ต่อท้ายจำนวน ("รายการ") */
  unit: string;
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
            {line.count} {unit}
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
  label,
  categories,
  lines,
  busy,
  onSave,
}: {
  label: string;
  categories: BudgetOption[];
  /** บรรทัดงบของเดือนนี้ — ใช้บอกวงเงิน/ยอดเดิมในดรอปดาวน์ และเติมวงเงินเดิมตอนเลือก */
  lines: BudgetLine[];
  busy: boolean;
  /** ส่ง id ของหมวด ไม่ใช่ชื่อ — ชื่อหมวดเปลี่ยนได้ แต่ id ไม่เปลี่ยน */
  onSave: (categoryId: string, limit: number) => void;
}) {
  const [category, setCategory] = useState("");
  const lineOf = (id: string) => lines.find((l) => l.category_id === id);
  const hint = (id: string) => {
    const l = lineOf(id);
    if (l?.limit) return ` · ตั้งไว้ ฿${baht(l.limit)}`;
    if (l && Number(l.spent) > 0) return ` · ใช้ไป ฿${baht(l.spent)}`;
    return "";
  };

  return (
    <section>
      <label htmlFor="add-budget-category" className="mb-2 block text-sm font-medium text-ink/60">
        {label}
      </label>
      <select
        id="add-budget-category"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        className="w-full rounded-lg border border-kraft bg-white px-3 py-2 text-sm focus:border-stamp focus:outline-none focus:ring-1 focus:ring-stamp"
      >
        <option value="">เลือกหมวด</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {labelOf(c)}
            {hint(c.id)}
          </option>
        ))}
      </select>
      {category && (
        <LimitEditor
          key={category}
          // หมวดที่ตั้งงบไว้แล้วเริ่มจากวงเงินเดิม ให้เห็นว่ากำลังแก้ ไม่ใช่ตั้งใหม่
          initial={lineOf(category)?.limit ? String(Number(lineOf(category)!.limit)) : ""}
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