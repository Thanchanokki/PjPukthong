import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";

import { Transaction, baht, deleteTransaction, fetchMonthly } from "../api";

const thisMonth = () => new Date().toISOString().slice(0, 7);

export default function MonthlyPage() {
  const [params, setParams] = useSearchParams();
  const month = params.get("month") ?? thisMonth();
  const qc = useQueryClient();

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["monthly", month],
    queryFn: () => fetchMonthly(month),
  });

  const remove = useMutation({
    mutationFn: deleteTransaction,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["monthly", month] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input
          type="month"
          value={month}
          onChange={(e) => setParams({ month: e.target.value })}
          className="field w-44"
        />
      </div>

      {isPending && <p className="text-sm text-slate-500">กำลังโหลด…</p>}
      {isError && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {(error as Error).message}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="รายรับ" value={data.income_total} tone="text-emerald-700" />
            <Stat label="รายจ่าย" value={data.expense_total} tone="text-rose-700" />
            <Stat
              label="คงเหลือ"
              value={data.net}
              tone={Number(data.net) < 0 ? "text-rose-700" : "text-slate-900"}
            />
          </div>

          {data.by_category.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="mb-3 text-sm font-medium">รายจ่ายตามหมวด</h2>
              <ul className="space-y-2">
                {data.by_category.map((c) => {
                  const pct =
                    Number(data.expense_total) > 0
                      ? (Number(c.total) / Number(data.expense_total)) * 100
                      : 0;
                  return (
                    <li key={c.category ?? "_"} className="text-sm">
                      <div className="mb-1 flex justify-between">
                        <span>
                          {c.category ?? "ไม่ระบุหมวด"}{" "}
                          <span className="text-xs text-slate-400">
                            ({c.count})
                          </span>
                        </span>
                        <span className="tabular-nums">฿{baht(c.total)}</span>
                      </div>
                      <div className="h-1.5 w-full rounded bg-slate-100">
                        <div
                          className="h-1.5 rounded bg-teal-600"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
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

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${tone}`}>
        ฿{baht(value)}
      </p>
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
          {tx.occurred_on}
          {tx.category && ` · ${tx.category}`}
          {tx.payment_method && ` · ${tx.payment_method}`}
          {tx.items.length > 0 && ` · ${tx.items.length} รายการ`}
        </p>
      </div>
      <span
        className={`tabular-nums font-medium ${
          tx.direction === "income" ? "text-emerald-700" : "text-slate-900"
        }`}
      >
        {tx.direction === "income" ? "+" : "−"}฿{baht(tx.total)}
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
