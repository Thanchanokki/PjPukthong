import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import {
  type DateAxis,
  Transaction,
  baht,
  deleteTransaction,
  fetchMonthly,
} from "../api";

const thisMonth = () => new Date().toISOString().slice(0, 7);

export default function MonthlyPage() {
  const [params, setParams] = useSearchParams();
  const month = params.get("month") ?? thisMonth();
  const qc = useQueryClient();
  /**
   * แกนเวลาที่ใช้ตีความคำว่า "เดือนนี้" — ดู db/models.ts ฝั่ง backend
   * เปลี่ยนแล้วได้คนละชุดข้อมูล ไม่ใช่แค่คนละลำดับ
   */
  const [axis, setAxis] = useState<DateAxis>("purchased");

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["monthly", month, axis],
    queryFn: () => fetchMonthly(month, axis),
  });

  const remove = useMutation({
    mutationFn: deleteTransaction,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["monthly", month] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="month"
          value={month}
          onChange={(e) => setParams({ month: e.target.value })}
          className="field w-44"
        />
        <div className="flex items-center gap-1 text-xs">
          <span className="text-slate-400">ดูตาม</span>
          {(
            [
              ["purchased", "เดือนที่ซื้อ"],
              ["uploaded", "เดือนที่สแกน"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setAxis(key)}
              className={`rounded-lg px-2.5 py-1 font-medium ${
                axis === key
                  ? "bg-teal-700 text-white"
                  : "border border-slate-300 bg-white text-slate-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {isPending && <p className="text-sm text-slate-500">กำลังโหลด…</p>}
      {isError && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {(error as Error).message}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Stat
              label={
                data.axis === "uploaded" ? "ยอดรวมของใบที่สแกนเดือนนี้" : "รายจ่ายรวม"
              }
              value={`฿${baht(data.expense_total)}`}
            />
            <Stat label="จำนวนรายการ" value={`${data.transaction_count}`} />
          </div>

          {data.axis === "uploaded" && (
            <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-500">
              กำลังดูตาม<b>เดือนที่สแกนเข้าระบบ</b> — ยอดนี้รวมใบที่ซื้อมาจากเดือนอื่นด้วย
              จึงไม่ใช่ค่าใช้จ่ายของเดือนนี้ ถ้าต้องการยอดรายเดือนจริงให้กด "เดือนที่ซื้อ"
            </p>
          )}

          <div className="rounded-xl border border-slate-200 bg-white">
            <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-medium">
              รายการทั้งหมด ({data.transactions.length})
            </h2>
            {data.transactions.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">
                ยังไม่มีรายการในเดือนนี้
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.transactions.map((tx) => (
                  <Row
                    key={tx.id}
                    tx={tx}
                    onDelete={() => {
                      if (confirm("ลบรายการนี้?")) remove.mutate(tx.id);
                    }}
                  />
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

function Row({ tx, onDelete }: { tx: Transaction; onDelete: () => void }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3 text-sm">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {tx.merchant_name ?? "(ไม่ระบุร้าน)"}
        </p>
        <p className="text-xs text-slate-500">
          ซื้อ {tx.purchased_at}
          {tx.payment_method && ` · ${tx.payment_method}`}
          {tx.items.length > 0 && ` · ${tx.items.length} รายการ`}
        </p>
        {/* เวลาที่ระบบรับรู้ — แสดงเฉพาะเมื่อต่างจากวันที่ซื้อ เพื่อไม่ให้รก
            และช่วยให้เห็นทันทีว่าใบไหนถ่ายย้อนหลัง (หรือ AI อ่านปีผิด) */}
        {tx.uploaded_at.slice(0, 10) !== tx.purchased_at && (
          <p className="text-xs text-slate-400">
            สแกนเข้าระบบ {tx.uploaded_at.slice(0, 10)}
          </p>
        )}
      </div>
      <span className="tabular-nums font-medium text-slate-900">
        ฿{baht(tx.total)}
      </span>
      {tx.receipt_id && (
        <a
          href={`/review/${tx.receipt_id}`}
          className="text-slate-400 hover:text-teal-700"
          title="ดูใบเสร็จ"
        >
          🧾
        </a>
      )}
      <button
        onClick={onDelete}
        className="text-slate-400 hover:text-red-600"
        title="ลบรายการ"
      >
        ✕
      </button>
    </li>
  );
}
