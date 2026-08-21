import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { LineItem, baht, createTransaction } from "../api";
import {
  DirectionToggle,
  ItemsEditor,
  SaveBar,
  TransactionFields,
} from "../components/FormFields";
import {
  EMPTY,
  type Form,
  buildPayload,
  canSave,
  today,
} from "../components/TransactionForm";

/** ฟอร์มเปล่าที่ตั้งวันที่เป็นวันนี้ไว้ให้ — ฟิลด์ที่เหลือปล่อยว่าง ห้ามเติมค่ามั่ว */
const blank = (direction: Form["direction"] = "expense"): Form => ({
  ...EMPTY,
  direction,
  occurred_on: today(),
});

export default function ManualPage() {
  const navigate = useNavigate();

  const [form, setForm] = useState<Form>(blank);
  const [items, setItems] = useState<LineItem[]>([]);
  const [saved, setSaved] = useState<{ total: string; count: number } | null>(null);

  const save = useMutation({
    mutationFn: (opts: { andNew: boolean }) =>
      createTransaction(buildPayload(form, items, null)).then((tx) => ({ tx, opts })),
    onSuccess: ({ tx, opts }) => {
      if (!opts.andNew) {
        navigate(`/monthly?month=${tx.occurred_on.slice(0, 7)}`);
        return;
      }
      // กรอกต่อ: ล้างฟอร์มแต่คงชนิดรายการกับวันที่ไว้ เพราะมักกรอกหลายใบของวันเดียวกัน
      setSaved((s) => ({ total: tx.total, count: (s?.count ?? 0) + 1 }));
      setForm((f) => ({ ...blank(f.direction), occurred_on: f.occurred_on }));
      setItems([]);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
  });

  const set = (k: keyof Form) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  function reset() {
    setForm(blank(form.direction));
    setItems([]);
    setSaved(null);
    save.reset();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">กรอกด้วยตนเอง</h1>
          <p className="text-sm text-slate-500">
            สำหรับรายการที่ไม่มีใบเสร็จ หรือใบที่ไม่อยากถ่ายรูป
          </p>
        </div>
        <button onClick={reset} className="btn-ghost shrink-0">
          ล้างฟอร์ม
        </button>
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
            onClick={() => navigate(`/monthly?month=${form.occurred_on.slice(0, 7)}`)}
            className="ml-2 underline underline-offset-2"
          >
            ดูสรุปรายเดือน
          </button>
        </div>
      )}

      <DirectionToggle
        value={form.direction}
        onChange={(d) => setForm((f) => ({ ...f, direction: d }))}
      />

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
        />
      </div>
    </div>
  );
}
