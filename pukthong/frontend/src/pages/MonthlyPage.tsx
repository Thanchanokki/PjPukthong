import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";

import { Transaction, baht, deleteTransaction, fetchMonthly, fetchMonths } from "../api";
import { ChevronRightIcon } from "../components/icons";
import { currentMonth, dayLabel, isoDate, monthName, monthShort, shiftMonth, shortDate } from "../dates";

/**
 * รายการรายเดือน — จัดตาม "วันที่ซื้อ" เสมอ ยอดจึงตรงกับหน้ารายงานและหน้างบ
 *
 * เดิมมีปุ่มสลับ "เดือนที่ซื้อ / เดือนที่สแกน" แต่ผู้ใช้ไม่เข้าใจความต่าง และพอสลับแล้ว
 * ยอดไม่ตรงกับหน้าอื่น จึงเอาออก — ใบที่สแกนย้อนหลังบอกด้วยบรรทัด "สแกนเมื่อ" แทน
 */
export default function MonthlyPage() {
  const [params, setParams] = useSearchParams();
  const month = params.get("month") ?? currentMonth();
  const qc = useQueryClient();
  const goTo = (m: string) => setParams({ month: m });

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["monthly", month, "purchased"],
    queryFn: () => fetchMonthly(month, "purchased"),
  });
  // ใช้บอกว่าข้อมูลอยู่เดือนไหนตอนเดือนที่เปิดว่างเปล่า — โหลดเฉพาะตอนจำเป็น
  const months = useQuery({
    queryKey: ["months", "purchased"],
    queryFn: () => fetchMonths("purchased"),
    enabled: data !== undefined && data.transactions.length === 0,
  });
  const latest = [...(months.data ?? [])].filter((m) => m.count > 0).sort((a, b) => b.month.localeCompare(a.month))[0];

  const remove = useMutation({
    mutationFn: deleteTransaction,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["monthly"] }),
  });

  // จัดกลุ่มตามวันที่ซื้อ ใหม่สุดก่อน — ในวันเดียวกันเรียงตามเวลาบนใบเสร็จ
  const groups: { date: string; txs: Transaction[] }[] = [];
  for (const tx of [...(data?.transactions ?? [])].sort(
    (a, b) =>
      b.purchased_at.localeCompare(a.purchased_at) ||
      (b.purchased_time ?? "").localeCompare(a.purchased_time ?? ""),
  )) {
    const last = groups[groups.length - 1];
    if (last?.date === tx.purchased_at) last.txs.push(tx);
    else groups.push({ date: tx.purchased_at, txs: [tx] });
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 text-ink">
      <header className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => goTo(shiftMonth(month, -1))}
          aria-label="เดือนก่อน"
          className="grid h-11 w-11 place-items-center rounded-xl border border-kraft bg-white"
        >
          <ChevronRightIcon className="h-5 w-5 rotate-180" aria-hidden="true" />
        </button>
        <div className="text-center">
          <h1 className="text-lg font-bold">{monthName(month)}</h1>
          <p className="text-xs text-ink/65">ตามวันที่ซื้อ</p>
        </div>
        <button
          type="button"
          onClick={() => goTo(shiftMonth(month, 1))}
          aria-label="เดือนถัดไป"
          className="grid h-11 w-11 place-items-center rounded-xl border border-kraft bg-white"
        >
          <ChevronRightIcon className="h-5 w-5" aria-hidden="true" />
        </button>
      </header>

      {isPending && <p className="text-sm text-ink/60">กำลังโหลด…</p>}
      {isError && (
        <div className="rounded-lg border border-stamp/40 bg-stamp/5 p-3 text-sm text-stamp">
          {(error as Error).message}
        </div>
      )}

      {data && data.transactions.length > 0 && (
        <>
          <div className="flex items-baseline justify-between rounded-xl border border-kraft bg-white px-4 py-3">
            <span className="text-sm text-ink/65">รายจ่ายรวม · {data.transaction_count} รายการ</span>
            <span className="font-mono text-xl font-bold tabular-nums">฿{baht(data.expense_total)}</span>
          </div>

          {groups.map((g) => (
            <section key={g.date}>
              <h2 className="mb-1.5 px-1 text-sm font-semibold text-ink/65">{dayLabel(g.date)}</h2>
              <ul className="divide-y divide-kraft/70 overflow-hidden rounded-xl border border-kraft bg-white">
                {g.txs.map((tx) => (
                  <Row
                    key={tx.id}
                    tx={tx}
                    onDelete={() => {
                      if (confirm("ลบรายการนี้?")) remove.mutate(tx.id);
                    }}
                  />
                ))}
              </ul>
            </section>
          ))}
        </>
      )}

      {data && data.transactions.length === 0 && (
        <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <h2 className="text-lg font-semibold">เดือนนี้ยังไม่มีรายการ</h2>
          <p className="text-sm leading-relaxed text-ink/65">
            ระบบจัดรายการตามวันที่บนใบเสร็จ ถ้าเพิ่งสแกนใบเก่า รายการจะอยู่ในเดือนที่ซื้อ
          </p>
          {latest && latest.month !== month && (
            <button
              type="button"
              onClick={() => goTo(latest.month)}
              className="flex min-h-[48px] items-center gap-2 rounded-xl border border-kraft bg-white px-5 font-semibold text-pine"
            >
              รายการล่าสุดอยู่ใน {monthShort(latest.month)}
              <ChevronRightIcon className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ tx, onDelete }: { tx: Transaction; onDelete: () => void }) {
  // uploaded_at เป็นเวลา UTC — แปลงเป็นวันที่ท้องถิ่นก่อนเทียบ ไม่งั้นช่วงตี 0–7 โมงวันจะเลื่อน
  const scannedOn = isoDate(new Date(tx.uploaded_at));
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{tx.merchant_name ?? "(ไม่ระบุร้าน)"}</p>
        <p className="text-xs text-ink/65">
          {tx.purchased_time ? `${tx.purchased_time.slice(0, 5)} น.` : "ไม่ระบุเวลา"}
          {tx.category && ` · ${tx.category}`}
          {tx.items.length > 0 && ` · ${tx.items.length} ชิ้น`}
        </p>
        {/* วันที่สแกนเป็นข้อมูลรอง — แสดงเฉพาะใบที่สแกนย้อนหลัง (หรือ AI อ่านปีผิด) */}
        {scannedOn !== tx.purchased_at && (
          <p className="text-[11px] text-ink/55">สแกนเมื่อ {shortDate(scannedOn)}</p>
        )}
      </div>
      <span className="shrink-0 font-mono font-bold tabular-nums text-stamp">−฿{baht(tx.total)}</span>
      {tx.receipt_id && (
        <Link
          to={`/review/${tx.receipt_id}`}
          aria-label="ดูใบเสร็จ"
          className="grid h-9 w-9 place-items-center rounded-lg text-ink/55 hover:bg-ink/5 hover:text-pine"
        >
          <ChevronRightIcon className="h-4 w-4" aria-hidden="true" />
        </Link>
      )}
      <button
        type="button"
        onClick={onDelete}
        aria-label="ลบรายการ"
        className="grid h-9 w-9 place-items-center rounded-lg text-ink/55 hover:bg-stamp/10 hover:text-stamp"
      >
        ✕
      </button>
    </li>
  );
}
