import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { LineItem, baht, createTransaction } from "../api";
import { ArrowLeftIcon } from "../components/icons";
import {
  ItemsEditor,
  SaveBar,
  TransactionFields,
} from "../components/FormFields";
import {
  EMPTY,
  type Form,
  buildPayload,
  canSave,
  emptyItem,
  today,
} from "../components/TransactionForm";

/** ฟอร์มเปล่าที่ตั้งวันที่เป็นวันนี้ไว้ให้ — ฟิลด์ที่เหลือปล่อยว่าง ห้ามเติมค่ามั่ว */
const blank = (): Form => ({
  ...EMPTY,
  purchased_at: today(),
});

export default function ManualPage() {
  const navigate = useNavigate();

  const [form, setForm] = useState<Form>(blank);
  /**
   * เริ่มด้วยบรรทัดเปล่าหนึ่งบรรทัดเสมอ
   *
   * หมวดค่าใช้จ่ายอยู่ที่ "ของแต่ละชิ้น" ที่เดียวแล้ว ถ้าเริ่มด้วยรายการว่างเปล่า
   * รายการที่กรอกเองจะไม่มีทางระบุหมวดได้เลย แล้วตกไปกอง "อื่นๆ" ทั้งหมดใน dashboard
   */
  const [items, setItems] = useState<LineItem[]>(() => [emptyItem()]);
  const [saved, setSaved] = useState<{ total: string; count: number } | null>(null);

  const save = useMutation({
    mutationFn: (opts: { andNew: boolean }) =>
      createTransaction(buildPayload(form, items, null)).then((tx) => ({ tx, opts })),
    onSuccess: ({ tx, opts }) => {
      if (!opts.andNew) {
        // บันทึกเสร็จแล้วพาไปหน้าสรุปทันที — ให้เห็นเลยว่ารายจ่ายก้อนนี้ไปอยู่หมวดไหน
        navigate(`/dashboard?month=${tx.purchased_at.slice(0, 7)}`);
        return;
      }
      // กรอกต่อ: ล้างฟอร์มแต่คงชนิดรายการกับวันที่ไว้ เพราะมักกรอกหลายใบของวันเดียวกัน
      setSaved((s) => ({ total: tx.total, count: (s?.count ?? 0) + 1 }));
      setForm((f) => ({ ...blank(), purchased_at: f.purchased_at }));
      setItems([emptyItem()]);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
  });

  const set = (k: keyof Form) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  function reset() {
    setForm(blank());
    setItems([emptyItem()]);
    setSaved(null);
    save.reset();
  }

  return (
    <div className="mx-auto -mt-6 max-w-2xl space-y-4 pb-4">
      {/* Header เข้ม + ปุ่มย้อนกลับ — ตามธีมของ mockup (docs/pukthong-uxui-mockup.html)
          ต่างจากหน้าอื่นที่ใช้ header อ่อนของ Shell เพราะหน้านี้ตั้งใจแยกโหมด
          "กรอกเอง" ให้รู้สึกต่างจากโหมด OCR ชัดเจน */}
      <div className="-mx-4 rounded-b-2xl bg-ink px-4 py-5 text-paper sm:-mx-6 sm:px-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            aria-label="ย้อนกลับ"
            className="-ml-1 rounded-full p-1.5 transition hover:bg-white/10"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </button>
          <h1 className="text-base font-semibold">กรอกรายการด้วยตนเอง</h1>
          <button
            onClick={reset}
            className="ml-auto text-xs font-medium text-paper/60 transition hover:text-paper"
          >
            ล้างฟอร์ม
          </button>
        </div>
      </div>

      {/* บอกผู้ใช้ตรงๆ ว่าโหมดนี้ไม่มี AI ช่วย เพื่อไม่ให้คาดหวังตัวเตือน ⚠️ (warn)
          แบบเดียวกับหน้ารีวิว OCR ที่ AI ไม่มั่นใจฟิลด์ไหนจะมีเครื่องหมายเตือน
          แต่หน้านี้ทุกอย่างมาจากผู้ใช้เอง 100% จึงไม่มีตัวบ่งชี้ความมั่นใจให้ */}
      <div className="rounded-xl border border-stamp/20 bg-stamp/5 px-4 py-3 text-sm leading-relaxed text-ink/70">
        สำหรับกรณีไม่มีใบเสร็จ หรือ OCR อ่านไม่ได้
      </div>

      {saved && (
        <div
          className="rounded-lg border border-teal-300 bg-teal-50 p-3 text-sm text-teal-900"
          role="status"
          aria-live="polite"
        >
          ✅ บันทึกแล้ว {saved.count} รายการ (ล่าสุด {baht(saved.total)} บาท) —
          กรอกรายการถัดไปได้เลย
          <button
            onClick={() => navigate(`/monthly?month=${form.purchased_at.slice(0, 7)}`)}
            className="ml-2 underline underline-offset-2"
          >
            ดูสรุปรายเดือน
          </button>
        </div>
      )}

      <TransactionFields form={form} onChange={set} />

      <ItemsEditor items={items} setItems={setItems} />

      {save.isError && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {(save.error as Error).message}
        </div>
      )}

      <div className="space-y-2">
        <button
          onClick={() => save.mutate({ andNew: true })}
          disabled={!canSave(form) || save.isPending}
          className="btn-ghost w-full"
        >
          บันทึกแล้วกรอกต่อ
        </button>
        <SaveBar
          onSave={() => save.mutate({ andNew: false })}
          disabled={!canSave(form)}
          pending={save.isPending}
          variant="stamp"
        />
      </div>
    </div>
  );
}