import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import { Monthly, baht, fetchMonthly, fetchMonths } from "../api";
import { FALLBACK } from "../categories";

const thisMonth = () => new Date().toISOString().slice(0, 7);

/**
 * สีเดียวทุกแท่งโดยตั้งใจ
 *
 * งานของกราฟนี้คือ "เทียบขนาด" ไม่ใช่ "แยกตัวตน" — ชื่อหมวดที่อยู่ข้างแท่งเป็นตัวบอก
 * อยู่แล้วว่าแท่งไหนคืออะไร ถ้าไล่สีให้ครบ 12 หมวดจะเกินเพดานสีที่คนแยกออก
 * (โดยเฉพาะคนตาบอดสี) และกลายเป็นสีที่ไม่ได้สื่ออะไรเลย
 */
const BAR = "#0d9488";

export default function DashboardPage() {
  const [params, setParams] = useSearchParams();
  const month = params.get("month") ?? thisMonth();
  const [showTable, setShowTable] = useState(false);

  const { data, isPending, isError, error } = useQuery({
    // key เดียวกับหน้ารายการเดือน — สลับแท็บไปมาไม่ยิงซ้ำ และตัวเลขสองหน้าตรงกันเสมอ
    queryKey: ["monthly", month],
    queryFn: () => fetchMonthly(month),
  });

  return (
    <div className="space-y-4">
      <input
        type="month"
        value={month}
        onChange={(e) => setParams({ month: e.target.value })}
        className="field w-44"
      />

      {isPending && <p className="text-sm text-slate-500">กำลังโหลด…</p>}
      {isError && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {(error as Error).message}
        </div>
      )}

      {data && data.transaction_count === 0 && (
        <EmptyState current={month} onPick={(m) => setParams({ month: m })} />
      )}

      {data && data.transaction_count > 0 && (
        <>
          <Hero data={data} />
          <CategoryChart
            rows={data.by_category}
            total={data.expense_total}
            showTable={showTable}
            onToggleTable={() => setShowTable((v) => !v)}
          />
          <DailyChart rows={data.by_day} />
        </>
      )}
    </div>
  );
}

/**
 * เดือนนี้ว่าง — แต่ต้องบอกด้วยว่ารายจ่ายไปอยู่เดือนไหน
 *
 * หน้านี้เปิดมาที่เดือนปัจจุบันเสมอ ส่วนใบเสร็จถูกจัดเข้าเดือนตาม "วันที่บนใบ"
 * ไม่ใช่วันที่อัปโหลด — ถ่ายใบเก่าหรือ AI อ่านปีผิดเมื่อไหร่ ข้อมูลจะไปโผล่เดือนอื่น
 * แล้วดูเหมือนหายไปเฉยๆ ถ้าไม่มีตัวนี้บอก
 */
function EmptyState({
  current,
  onPick,
}: {
  current: string;
  onPick: (month: string) => void;
}) {
  // ห่อด้วย arrow เสมอ — ถ้าส่ง fetchMonths ตรงๆ React Query จะยัด context ของมัน
  // เข้าไปเป็นอาร์กิวเมนต์แรก แล้วกลายเป็น axis ที่ไม่ถูกต้อง
  const { data: months } = useQuery({
    queryKey: ["months", "purchased"],
    queryFn: () => fetchMonths("purchased"),
  });
  const others = (months ?? []).filter((m) => m.month !== current);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
      <p className="text-sm text-slate-500">ยังไม่มีรายจ่ายในเดือนนี้</p>

      {others.length === 0 ? (
        <p className="mt-1 text-xs text-slate-400">ถ่ายใบเสร็จสักใบแล้วกลับมาดูใหม่</p>
      ) : (
        <>
          <p className="mt-4 text-xs text-slate-500">
            แต่มีรายจ่ายอยู่ในเดือนอื่น — ใบเสร็จถูกจัดเข้าเดือนตาม
            <b> วันที่บนใบ</b> ไม่ใช่วันที่อัปโหลด
          </p>
          <ul className="mx-auto mt-3 flex max-w-sm flex-col gap-1">
            {others.map((m) => (
              <li key={m.month}>
                <button
                  onClick={() => onPick(m.month)}
                  className="flex w-full items-center justify-between rounded-lg border
                             border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
                >
                  <span>{m.month}</span>
                  <span className="tabular-nums text-slate-500">
                    ฿{baht(m.total)}
                    <span className="ml-2 text-xs text-slate-400">{m.count} ใบ</span>
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

/** ตัวเลขนำของหน้า — hero figure ไม่ใช่กราฟแท่งเดียว */
function Hero({ data }: { data: Monthly }) {
  const days = data.by_day.length;
  const avg = days > 0 ? Number(data.expense_total) / days : 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-xs text-slate-500">รายจ่ายรวมเดือนนี้</p>
      <p className="mt-1 text-4xl font-semibold tabular-nums text-slate-900">
        ฿{baht(data.expense_total)}
      </p>
      <p className="mt-2 text-xs text-slate-500">
        {data.transaction_count} ใบเสร็จ · {days} วันที่มีรายจ่าย · เฉลี่ยวันละ ฿
        {baht(avg)}
      </p>
    </div>
  );
}

function CategoryChart({
  rows,
  total,
  showTable,
  onToggleTable,
}: {
  rows: Monthly["by_category"];
  total: string;
  showTable: boolean;
  onToggleTable: () => void;
}) {
  // สเกลเทียบกับหมวดที่มากที่สุด ไม่ใช่ยอดรวม — แท่งสั้นๆ จะได้ยังพอมองเห็นความต่าง
  const max = Math.max(...rows.map((r) => Math.abs(Number(r.total))), 0);
  const grand = Number(total);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="text-sm font-medium">เงินไปกับอะไรบ้าง</h2>
        <button onClick={onToggleTable} className="text-xs text-teal-700 hover:underline">
          {showTable ? "ดูกราฟ" : "ดูเป็นตาราง"}
        </button>
      </div>
      <p className="mb-4 text-xs text-slate-400">
        แยกตามของแต่ละชิ้นบนใบเสร็จ ไม่ใช่ทั้งใบรวมเป็นหมวดเดียว
      </p>

      {showTable ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="pb-2 font-medium">หมวด</th>
              <th className="pb-2 text-right font-medium">ชิ้น</th>
              <th className="pb-2 text-right font-medium">ยอด</th>
              <th className="pb-2 text-right font-medium">สัดส่วน</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.category}>
                <td className="py-2">{r.category}</td>
                <td className="py-2 text-right tabular-nums text-slate-500">
                  {r.count || "—"}
                </td>
                <td className="py-2 text-right tabular-nums">฿{baht(r.total)}</td>
                <td className="py-2 text-right tabular-nums text-slate-500">
                  {grand > 0 ? ((Number(r.total) / grand) * 100).toFixed(1) : "0.0"}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const value = Number(r.total);
            const pct = grand > 0 ? (value / grand) * 100 : 0;
            const width = max > 0 ? (Math.abs(value) / max) * 100 : 0;
            return (
              <li
                key={r.category}
                className="group"
                title={`${r.category} · ฿${baht(r.total)} · ${pct.toFixed(1)}% ของรายจ่ายทั้งเดือน`}
              >
                <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate">
                    {r.category}
                    {r.count > 0 && (
                      <span className="ml-1 text-xs text-slate-400">({r.count})</span>
                    )}
                  </span>
                  {/* direct label ทุกแท่ง — ตัวเลขต้องอ่านได้โดยไม่ต้อง hover */}
                  <span className="shrink-0 tabular-nums text-slate-600">
                    ฿{baht(r.total)}
                    <span className="ml-1.5 text-xs text-slate-400">
                      {pct.toFixed(0)}%
                    </span>
                  </span>
                </div>
                <div className="h-2 w-full rounded bg-slate-100">
                  <div
                    className="h-2 rounded transition-[width] group-hover:brightness-110"
                    style={{ width: `${width}%`, backgroundColor: BAR }}
                  />
                </div>
                {r.category === FALLBACK && (
                  <p className="mt-1 text-xs text-slate-400">
                    รวม VAT ส่วนลด และของที่ยังไม่ได้เลือกหมวด
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** รายจ่ายรายวัน — เห็นว่าเดือนนี้ใช้หนักช่วงไหน */
function DailyChart({ rows }: { rows: Monthly["by_day"] }) {
  if (rows.length < 2) return null;
  const max = Math.max(...rows.map((r) => Number(r.total)), 0);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-4 text-sm font-medium">รายจ่ายรายวัน</h2>
      <div className="flex h-32 items-end gap-1 overflow-x-auto">
        {rows.map((r) => (
          <div
            key={r.date}
            className="flex min-w-[14px] flex-1 flex-col items-center gap-1"
            title={`${r.date} · ฿${baht(r.total)}`}
          >
            <div
              className="w-full rounded-t transition-[height] hover:brightness-110"
              style={{
                height: `${max > 0 ? (Number(r.total) / max) * 100 : 0}%`,
                backgroundColor: BAR,
                minHeight: "2px",
              }}
            />
            <span className="text-[10px] tabular-nums text-slate-400">
              {r.date.slice(8)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
