import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import {
  ExtractResult,
  LineItem,
  createTransaction,
  extractReceipt,
  imageUrl,
} from "../api";
import {
  ItemsEditor,
  SaveBar,
  TransactionFields,
} from "../components/FormFields";
import { ScanConfidenceCard } from "../components/ScanConfidenceCard";
import {
  EMPTY,
  type Form,
  buildPayload,
  canSave,
  draftToForm,
} from "../components/TransactionForm";

export default function ReviewPage() {
  const { receiptId = "" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const [form, setForm] = useState<Form>(EMPTY);
  const [items, setItems] = useState<LineItem[]>([]);
  const [result, setResult] = useState<ExtractResult | null>(null);
  const [pane, setPane] = useState<"image" | "form">("form");
  const autoRan = useRef(false);

  const extract = useMutation({
    mutationFn: () => extractReceipt(receiptId),
    onSuccess: (res) => {
      setResult(res);
      setForm(draftToForm(res.draft));
      setItems(res.draft.line_items);
    },
  });

  const save = useMutation({
    mutationFn: () => createTransaction(buildPayload(form, items, receiptId)),
    onSuccess: (tx) => // บันทึกเสร็จแล้วพาไปหน้าสรุปทันที — ให้เห็นเลยว่ารายจ่ายก้อนนี้ไปอยู่หมวดไหน
      navigate(`/dashboard?month=${tx.purchased_at.slice(0, 7)}`),
  });

  // มาจากปุ่ม ✨ บนหน้าถ่ายรูป -> ยิง extract ให้เลยครั้งเดียว
  useEffect(() => {
    if (params.get("auto") === "1" && !autoRan.current) {
      autoRan.current = true;
      extract.mutate();
    }
  }, [params, extract]);

  const warnings = result?.warnings ?? [];
  const confidence = result?.draft.confidence ?? {};

  /** ฟิลด์ไหนควรไฮไลต์เหลือง: AI ไม่มั่นใจ หรือถูกพูดถึงใน warnings */
  const warnSet = useMemo(() => {
    const set = new Set<string>();
    for (const [k, v] of Object.entries(confidence)) if (v < 0.7) set.add(k);
    if (warnings.some((w) => w.includes("ยอดรวม") || w.includes("ผลรวมรายการ")))
      set.add("total");
    if (warnings.some((w) => w.includes("วันที่"))) set.add("issued_at");
    if (warnings.some((w) => w.includes("เลขผู้เสียภาษี"))) set.add("merchant_tax_id");
    return set;
  }, [confidence, warnings]);

  const set = (k: keyof Form) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const imagePane = (
    <div className="rounded-xl border border-slate-200 bg-white p-2">
      <img
        src={imageUrl(receiptId)}
        alt="ใบเสร็จ"
        className="max-h-[75vh] w-full cursor-zoom-in object-contain"
        onClick={() => window.open(imageUrl(receiptId), "_blank")}
      />
      <p className="p-2 text-center text-xs text-slate-500">
        แตะที่รูปเพื่อเปิดดูขนาดเต็ม
      </p>
    </div>
  );

  const formPane = (
    <div className="space-y-4">
      {/* แบนเนอร์คุณภาพ */}
      {extract.isPending && (
        <div
          className="flex flex-col items-center gap-3 rounded-lg bg-[#0d161b] px-3 py-6 text-sm text-slate-200"
          role="status"
          aria-live="polite"
        >
          {/* พื้นหลังเข้มเพราะตาเป็นสีขาว ถ้าวางบนพื้นอ่อนจะมองไม่เห็น */}
          <span className="loader" aria-hidden="true" />
          <span>AI กำลังอ่านใบเสร็จ… (ใช้เวลาสักครู่)</span>
        </div>
      )}
      {extract.isError && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {(extract.error as Error).message}
          <p className="mt-1 text-xs">กรอกข้อมูลเองด้านล่างได้ตามปกติ</p>
        </div>
      )}
      {result?.scan_confidence && (
        <ScanConfidenceCard conf={result.scan_confidence} />
      )}

      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="mb-1 font-medium">ตรวจสอบก่อนบันทึก</p>
          <ul className="list-inside list-disc space-y-0.5">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <button
        onClick={() => extract.mutate()}
        disabled={extract.isPending}
        className={result ? "btn-ghost w-full" : "btn-primary w-full py-3"}
      >
        {extract.isPending
          ? "ระบบกำลังอ่านใบเสร็จ…"
          : result
            ? "ระบบกำลังอ่านซ้ำ"
            : "ระบบกำลังอ่านใบเสร็จ"}
      </button>

      <TransactionFields form={form} onChange={set} warnSet={warnSet} />

      <ItemsEditor
        items={items}
        setItems={setItems}
        incomplete={result ? !result.draft.line_items_complete : false}
      />

      {save.isError && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {(save.error as Error).message}
        </div>
      )}

      <SaveBar
        onSave={() => save.mutate()}
        disabled={!canSave(form)}
        pending={save.isPending}
      />
    </div>
  );

  return (
    <div>
      {/* มือถือ: สลับแท็บ  เดสก์ท็อป: สองฝั่ง */}
      <div className="mb-3 flex gap-2 lg:hidden">
        <button
          onClick={() => setPane("image")}
          className={pane === "image" ? "btn-primary flex-1" : "btn-ghost flex-1"}
        >
          รูปใบเสร็จ
        </button>
        <button
          onClick={() => setPane("form")}
          className={pane === "form" ? "btn-primary flex-1" : "btn-ghost flex-1"}
        >
          ฟอร์ม
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={pane === "image" ? "" : "hidden lg:block"}>{imagePane}</div>
        <div className={pane === "form" ? "" : "hidden lg:block"}>{formPane}</div>
      </div>
    </div>
  );
}
