import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";

import { baht, fetchInsuranceSummary } from "../api";
import { ArrowLeftIcon } from "../components/icons";

/**
 * สรุปเบี้ยประกันรายปีเพื่อลดหย่อนภาษีเงินได้บุคคลธรรมดา
 *
 * ดึงจากใบเสร็จที่ประเภทร้านเป็น "ประกันภัย" — ตัวเลขเป็นค่าประมาณ เพดานและเงื่อนไข
 * มาจาก backend/src/shared/insurance.ts ผู้ใช้ต้องตรวจกับหนังสือรับรองของบริษัทประกันเอง
 */
export default function TaxPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const year = Number(params.get("year")) || new Date().getFullYear();

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["tax-insurance", year],
    queryFn: () => fetchInsuranceSummary(year),
  });

  const arrow =
    "grid h-9 w-9 place-items-center rounded-full text-lg text-ink/60 hover:bg-ink/5";

  return (
    <div className="mx-auto -mt-6 max-w-2xl space-y-4 pb-4 text-ink">
      <div className="-mx-4 rounded-b-2xl bg-ink px-4 py-5 text-paper sm:-mx-6 sm:px-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            aria-label="ย้อนกลับ"
            className="-ml-1 rounded-full p-1.5 transition hover:bg-white/10"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </button>
          <h1 className="text-base font-semibold">ลดหย่อนภาษี: เบี้ยประกัน</h1>
        </div>
      </div>

      <div className="flex items-center justify-center">
        <button type="button" className={arrow} onClick={() => setParams({ year: String(year - 1) })} aria-label="ปีก่อนหน้า">
          ‹
        </button>
        <span className="min-w-[9rem] text-center text-sm font-medium" aria-live="polite">
          ปีภาษี {year + 543}
        </span>
        <button type="button" className={arrow} onClick={() => setParams({ year: String(year + 1) })} aria-label="ปีถัดไป">
          ›
        </button>
      </div>

      {isPending && <p className="text-center text-sm text-ink/50">กำลังโหลด…</p>}
      {isError && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {(error as Error).message}
        </div>
      )}

      {data && (
        <>
          <section className="rounded-xl border border-kraft bg-white p-5 text-center">
            <p className="text-xs text-ink/50">ลดหย่อนได้ประมาณ</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">฿{baht(data.total_deductible)}</p>
            <p className="mt-1 text-xs text-ink/50">จากเบี้ยที่จ่ายทั้งปี ฿{baht(data.total_premium)}</p>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-medium text-ink/60">แยกตามประเภทกรมธรรม์</h2>
            <ul className="divide-y divide-kraft rounded-xl border border-kraft bg-white">
              {data.by_type.map((t) => (
                <li key={t.policy_type} className="px-4 py-3">
                  <div className="flex items-baseline gap-3">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.name}</span>
                    <span className="font-mono text-sm tabular-nums">฿{baht(t.deductible)}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-ink/50">
                    จ่ายแล้ว ฿{baht(t.premium_paid)}
                    {t.cap !== null ? ` · เพดาน ฿${baht(t.cap)}` : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-ink/40">{t.note}</p>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-medium text-ink/60">กรมธรรม์ที่บันทึกไว้ ({data.policies.length})</h2>
            {data.policies.length === 0 ? (
              <p className="rounded-xl border border-dashed border-kraft px-4 py-6 text-center text-sm text-ink/50">
                ยังไม่มีใบเสร็จค่าเบี้ยประกันในปีนี้ — สแกนใบเสร็จจากบริษัทประกันได้ที่หน้าเพิ่มรายการ
              </p>
            ) : (
              <ul className="divide-y divide-kraft rounded-xl border border-kraft bg-white">
                {data.policies.map((p) => (
                  <li key={p.transaction_id} className="flex items-start gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.insurer ?? "(ไม่ระบุบริษัท)"}</p>
                      <p className="truncate text-xs text-ink/50">
                        {p.policy_type_name ?? "ไม่ระบุประเภท"}
                        {p.policy_number && ` · เลขที่ ${p.policy_number}`}
                      </p>
                      <p className="truncate text-xs text-ink/40">
                        จ่ายเมื่อ {p.paid_at}
                        {p.coverage_start && p.coverage_end && ` · คุ้มครอง ${p.coverage_start} ถึง ${p.coverage_end}`}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-sm tabular-nums">{baht(p.premium)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
            ⚠️ {data.disclaimer}
          </p>
        </>
      )}
    </div>
  );
}
