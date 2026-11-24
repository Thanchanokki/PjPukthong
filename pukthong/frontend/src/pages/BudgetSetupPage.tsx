import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { baht } from "../api";
import { type BudgetAxis, type BudgetOption, fetchBudget, saveBudgetLimit } from "../budget";
import { ArrowLeftIcon, PlusIcon } from "../components/icons";

/**
 * หน้าตั้งงบรายหมวด (/budget/new?month=&by=&category=) — แทนดรอปดาวน์ท้ายหน้างบเดิม
 *
 * 1. เลือกหมวดจากการ์ด (หมวดที่ตั้งงบไว้แล้วบอกวงเงินเดิม เลือกซ้ำ = แก้วงเงิน)
 * 2. กรอกวงเงิน หรือกดปุ่มลัด แล้วเลือกว่าจะ "ใช้ทุกเดือน" ไหม
 *
 * การเตือนที่ 80% เป็นกติกาเดียวกันทุกหมวด (ดู BudgetAlertDialog) จึงแสดงเป็นข้อความ ไม่ใช่ตัวเลือก
 */

const PRESETS = [1000, 1500, 2000, 3000];
/** เกณฑ์เดียวกับ BudgetAlertDialog และแถบสีในหน้างบ */
const ALERT_RATIO = 0.8;

/** ชื่อสั้นของประเภทร้านให้พอดีการ์ด — ชื่อเต็มยาวเกินช่อง ("ร้านอาหาร/คาเฟ่/เครื่องดื่ม") */
const SHORT_NAME: Record<string, string> = {
  convenience: "สะดวกซื้อ",
  supermarket: "ซูเปอร์มาร์เก็ต",
  restaurant: "อาหาร / คาเฟ่",
  pharmacy: "ยา / คลินิก",
  beauty_personal: "ของใช้ส่วนตัว",
  department_fashion: "ห้าง / แฟชั่น",
  home_hardware: "ของใช้ในบ้าน",
  fuel_transport: "น้ำมัน / เดินทาง",
  bills_services: "บิล / บริการ",
  general_other: "อื่น ๆ",
};

const nameOf = (axis: BudgetAxis, o: BudgetOption) =>
  (axis === "merchant" && SHORT_NAME[o.id]) || o.name;

/** เวลาท้องถิ่น — toISOString() เป็น UTC ช่วงตี 0–7 โมงไทยจะได้เดือนผิด */
const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const monthName = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("th-TH", { month: "long", year: "numeric" });
};

export default function BudgetSetupPage() {
  const [params] = useSearchParams();
  const month = params.get("month") ?? thisMonth();
  const axis: BudgetAxis = params.get("by") === "item" ? "item" : "merchant";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const back = () => navigate(`/budget?month=${month}&by=${axis}`);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["budget", month, axis],
    queryFn: () => fetchBudget(month, axis),
  });
  const lines = data?.lines ?? [];
  const lineOf = (id: string) => lines.find((l) => l.category_id === id);

  const [category, setCategory] = useState(params.get("category") ?? "");
  const [amount, setAmount] = useState("");
  const [recurring, setRecurring] = useState(true);
  // หมวดที่ส่งมาทาง URL ต้องรอข้อมูลก่อนถึงจะรู้วงเงินเดิม — เติมครั้งเดียวตอนข้อมูลมา
  const [prefilled, setPrefilled] = useState(false);
  if (data && !prefilled) {
    setPrefilled(true);
    if (category) pick(category);
  }

  /** เลือกหมวด: หมวดที่ตั้งงบไว้แล้วเริ่มจากวงเงินและตัวเลือกเดิม ให้เห็นว่ากำลังแก้ ไม่ใช่ตั้งใหม่ */
  function pick(id: string) {
    const line = lineOf(id);
    setCategory(id);
    setAmount(line?.limit ? String(Number(line.limit)) : "");
    setRecurring(line?.limit ? line.recurring : true);
  }

  const value = Number(amount);
  const valid = amount.trim() !== "" && Number.isFinite(value) && value > 0;
  const selected = data?.options.find((o) => o.id === category);
  const selectedLine = category ? lineOf(category) : undefined;

  // งบรวมหลังบันทึก = งบหมวดอื่นที่ตั้งไว้ + วงเงินใหม่ของหมวดนี้
  const others = lines.filter((l) => l.limit !== null && l.category_id !== category);
  const totalAfter = others.reduce((s, l) => s + Number(l.limit), 0) + (valid ? value : 0);
  const countAfter = others.length + (valid ? 1 : 0);

  const save = useMutation({
    mutationFn: () => saveBudgetLimit(month, axis, category, value, recurring),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["budget"] });
      back();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (selected && valid && !save.isPending) save.mutate();
  };

  return (
    <form onSubmit={submit} className="mx-auto -mt-6 max-w-xl pb-40 text-ink">
      <div className="-mx-4 bg-ink px-4 py-5 text-paper sm:-mx-6 sm:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={back}
            aria-label="ย้อนกลับ"
            className="-ml-1 rounded-full p-1.5 transition hover:bg-white/10"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-lg font-semibold">ตั้งงบหมวดหมู่</h1>
            <p className="text-xs text-paper/70">
              {monthName(month)} · {axis === "merchant" ? "ตามประเภทร้าน" : "ตามหมวดสินค้า"}
            </p>
          </div>
        </div>
      </div>

      {isPending && <p className="mt-6 text-sm text-ink/60">กำลังโหลด…</p>}
      {isError && <ErrorBox message={(error as Error).message} />}

      {data && (
        <div className="space-y-7 pt-6">
          <section>
            <h2 className="mb-3 font-semibold text-ink/75">1. เลือกหมวด</h2>
            <div className="grid grid-cols-3 gap-2.5">
              {data.options.map((o) => {
                const limit = lineOf(o.id)?.limit;
                const active = o.id === category;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => pick(o.id)}
                    aria-pressed={active}
                    className={`flex min-h-[84px] flex-col items-center justify-center gap-1.5 rounded-xl border-2 px-1.5 py-3 text-center text-sm transition ${
                      active
                        ? "border-stamp bg-stamp/10 font-semibold text-stamp"
                        : "border-kraft bg-white hover:border-ink/30"
                    }`}
                  >
                    <TileIcon axis={axis} option={o} />
                    <span className="leading-tight">{nameOf(axis, o)}</span>
                    {limit && <span className="text-xs text-stamp">ตั้งแล้ว ฿{baht(limit).replace(".00", "")}</span>}
                  </button>
                );
              })}
              {axis === "item" && (
                <Link
                  to="/categories"
                  className="flex min-h-[84px] flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-kraft px-1.5 py-3 text-center text-sm text-ink/65 hover:border-ink/30"
                >
                  <PlusIcon className="h-6 w-6" aria-hidden="true" />
                  สร้างหมวดเอง
                </Link>
              )}
            </div>
          </section>

          {selected && (
            <>
              <section>
                <label htmlFor="budget-amount" className="mb-3 block font-semibold text-ink/75">
                  2. วงเงินต่อเดือน
                </label>
                <div className="flex items-center gap-3 rounded-xl border-2 border-stamp bg-white px-5 py-4 focus-within:ring-2 focus-within:ring-stamp/30">
                  <span className="text-3xl font-bold text-ink/70" aria-hidden="true">฿</span>
                  <input
                    id="budget-amount"
                    type="number"
                    inputMode="decimal"
                    // step="any" — step={100} คู่กับ min เบราว์เซอร์จะปฏิเสธ 1000/5000 (ดู LimitEditor)
                    min={0}
                    step="any"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0"
                    className="min-w-0 flex-1 bg-transparent font-mono text-4xl font-bold tabular-nums outline-none placeholder:text-ink/25"
                  />
                  <span className="text-ink/60">/ เดือน</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {PRESETS.map((p) => {
                    const on = valid && value === p;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setAmount(String(p))}
                        aria-pressed={on}
                        className={`min-h-[44px] rounded-full border-2 px-4 font-mono text-sm tabular-nums ${
                          on ? "border-stamp bg-stamp/10 font-bold text-stamp" : "border-kraft bg-white"
                        }`}
                      >
                        ฿{p.toLocaleString("th-TH")}
                      </button>
                    );
                  })}
                </div>
                <Note>
                  {selectedLine && Number(selectedLine.spent) > 0
                    ? `เดือนนี้ใช้ไปแล้ว ฿${baht(selectedLine.spent)} จาก ${selectedLine.count} รายการ`
                    : "หมวดนี้ยังไม่มีใบเสร็จ เลยยังไม่มียอดย้อนหลังให้เทียบ ลองตั้งไว้ก่อน แล้วค่อยปรับเดือนหน้า"}
                </Note>
              </section>

              <section className="divide-y divide-kraft overflow-hidden rounded-xl border border-kraft bg-white">
                <label className="flex cursor-pointer items-center gap-3 px-4 py-3.5">
                  <span className="flex-1">
                    <span className="block font-semibold">ใช้ทุกเดือน</span>
                    <span className="block text-sm text-ink/65">ไม่ต้องตั้งใหม่ทุกเดือน แก้หรือลบได้ทุกเมื่อ</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={recurring}
                    onChange={(e) => setRecurring(e.target.checked)}
                    className="h-6 w-6 accent-stamp"
                  />
                </label>
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <span className="flex-1">
                    <span className="block font-semibold">เตือนเมื่อใช้ถึง 80%</span>
                    <span className="block text-sm text-ink/65">
                      {valid
                        ? `แจ้งเมื่อเหลือ ฿${baht(value * (1 - ALERT_RATIO)).replace(".00", "")}`
                        : "ระบบเตือนทุกหมวดที่ตั้งงบไว้"}
                    </span>
                  </span>
                  <span className="rounded-full bg-mist px-2.5 py-1 text-xs font-medium text-pine">อัตโนมัติ</span>
                </div>
              </section>

              <section className="rounded-2xl bg-ink px-5 py-5 text-paper" aria-live="polite">
                <p className="text-sm text-paper/75">หลังบันทึก งบรวมต่อเดือนจะเป็น</p>
                <div className="mt-2 flex items-baseline justify-between gap-3">
                  <span className="font-mono text-3xl font-bold tabular-nums">฿{baht(totalAfter)}</span>
                  <span className="text-sm text-paper/75">จาก {countAfter} หมวด</span>
                </div>
              </section>

              {save.isError && <ErrorBox message={(save.error as Error).message} />}
            </>
          )}
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 border-t border-kraft bg-paper/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto max-w-xl space-y-1">
          <button
            type="submit"
            disabled={!selected || !valid || save.isPending}
            className="min-h-[52px] w-full rounded-xl bg-stamp px-4 text-base font-semibold text-white transition hover:bg-stamp/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {save.isPending
              ? "กำลังบันทึก…"
              : selected && valid
                ? `บันทึกงบ ${nameOf(axis, selected)} ฿${value.toLocaleString("th-TH")}`
                : selected
                  ? "กรอกวงเงิน"
                  : "เลือกหมวดก่อน"}
          </button>
          <button type="button" onClick={back} className="min-h-[44px] w-full text-sm text-ink/65 hover:text-ink">
            ยกเลิก
          </button>
        </div>
      </div>
    </form>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 flex gap-2.5 rounded-xl bg-kraft/40 px-4 py-3 text-sm leading-relaxed text-ink/75">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="mt-0.5 h-5 w-5 flex-none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5M12 8h.01" strokeLinecap="round" />
      </svg>
      <span>{children}</span>
    </p>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="mt-4 rounded-lg border border-stamp/40 bg-stamp/5 p-3 text-sm text-stamp">{message}</div>
  );
}

/** เส้นไอคอนของประเภทร้าน (viewBox 24, เส้น 1.8 แบบเดียวกับ components/icons) */
const MERCHANT_ICON: Record<string, ReactNode> = {
  convenience: <><path d="M4 10v10h16V10" /><path d="M3 10l2-6h14l2 6Z" /><path d="M9 20v-5h6v5" /></>,
  supermarket: <><path d="M3 4h2l2.4 11h11L21 7H6.2" /><circle cx="9" cy="19" r="1.3" /><circle cx="17" cy="19" r="1.3" /></>,
  restaurant: <><path d="M7 3v8a2 2 0 0 0 4 0V3M9 11v10" /><path d="M16 3c-1.7 0-3 2-3 5s1.3 4 3 4v9" /></>,
  pharmacy: <><rect x="3" y="8" width="18" height="8" rx="4" /><path d="M12 8v8" /></>,
  beauty_personal: <><path d="M9 3h6v4l1 2v12H8V9l1-2Z" /><path d="M8 13h8" /></>,
  department_fashion: <><path d="M5 8h14l-1 13H6Z" /><path d="M9 8a3 3 0 0 1 6 0" /></>,
  home_hardware: <><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></>,
  fuel_transport: <><path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h14M5 11h10" /><path d="M15 8h2l2 3v6a1.5 1.5 0 0 0 3 0v-7l-3-3" /></>,
  bills_services: <><path d="M6 3h9l4 4v14H6Z" /><path d="M14 3v5h5M9 13h7M9 17h5" /></>,
  general_other: <><circle cx="6" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="18" cy="12" r="1.3" /></>,
};

function TileIcon({ axis, option }: { axis: BudgetAxis; option: BudgetOption }) {
  const path = axis === "merchant" ? MERCHANT_ICON[option.id] : undefined;
  if (path) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7" aria-hidden="true">
        {path}
      </svg>
    );
  }
  // หมวดสินค้าใช้ไอคอนที่ผู้ใช้/ระบบตั้งไว้กับหมวด
  return <span className="text-2xl leading-none" aria-hidden="true">{option.icon ?? "•"}</span>;
}
