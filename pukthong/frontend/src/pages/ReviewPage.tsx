/**
 * หน้า "ตรวจสอบข้อมูล" — ขั้น 3 ของ flow สแกน (1 ถ่าย · 2 ครอบและส่ง · 3 ตรวจสอบ)
 *
 * ระบบอ่านใบเสร็จให้อัตโนมัติ (มาจาก ?auto=1) แล้วแสดงเป็นกล่องตามหัวข้อให้ตรวจ/แก้
 * ข้อมูลร้านค้า · รายการสินค้า · ส่วนลดและ VAT · การชำระเงิน · สรุปยอด
 * ยอดที่จ่ายจริงกับปุ่มบันทึกอยู่ในแถบติดล่างจอ (เมนูล่างของแอปถูกซ่อนในหน้านี้ ดู App.tsx)
 */
import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import { BillDiscount, ExtractResult, LineItem, createTransaction, extractReceipt, imageUrl } from "../api";
import { useMerchantTypes } from "../categories";
import {
  DiscountVatSection,
  ItemsSection,
  PaymentSection,
  StickyTotalBar,
  StoreSection,
  SummaryCard,
  computeTotals,
} from "../components/ReviewSections";
import { DuplicateNotice } from "../components/DuplicateNotice";
import { ScanConfidenceCard } from "../components/ScanConfidenceCard";
import { ScanHeader } from "../components/ScanHeader";
import {
  EMPTY,
  type Form,
  applyMerchantDefault,
  buildPayload,
  canSave,
  draftToForm,
} from "../components/TransactionForm";
import { UnsupportedDialog } from "../components/UnsupportedDialog";
import { CheckIcon, XIcon } from "../components/icons";
import { money } from "../components/FormFields";

export default function ReviewPage() {
  const { receiptId = "" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const [form, setForm] = useState<Form>(EMPTY);
  const [items, setItems] = useState<LineItem[]>([]);
  const [billDiscounts, setBillDiscounts] = useState<BillDiscount[]>([]);
  const [result, setResult] = useState<ExtractResult | null>(null);
  const [showImage, setShowImage] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const autoRan = useRef(false);
  /** ปิดป๊อปอัพแล้วไม่เด้งซ้ำจนกว่าจะกดให้อ่านใหม่ */
  const [dismissed, setDismissed] = useState(false);
  const closeDialog = useCallback(() => setDismissed(true), []);

  /**
   * สถานะการอ่านเก็บเองแทน extract.isPending — ตอน dev React (StrictMode) mount หน้าซ้ำ
   * observer ที่สั่ง mutate ตอนอ่านอัตโนมัติถูกถอดไปแล้ว isPending จึงค้างเป็น true ตลอด
   * แม้ข้อมูลจะมาแล้ว ส่วน callback ระดับ hook ยังทำงานเสมอ
   */
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<Error | null>(null);
  const extract = useMutation({
    mutationFn: () => extractReceipt(receiptId),
    onMutate: () => {
      setReading(true);
      setReadError(null);
    },
    onError: (e) => setReadError(e as Error),
    onSettled: () => setReading(false),
    onSuccess: (res) => {
      setResult(res);
      setDismissed(false);
      setForm(draftToForm(res.draft));
      setItems(res.draft.line_items);
      setBillDiscounts(res.draft.bill_discounts ?? []);
    },
  });

  const save = useMutation({
    mutationFn: () => createTransaction(buildPayload(form, items, receiptId, billDiscounts)),
    // บันทึกเสร็จแล้วพาไปหน้าสรุปทันที — ให้เห็นเลยว่ารายจ่ายก้อนนี้ไปอยู่หมวดไหน
    onSuccess: (tx) => navigate(`/dashboard?month=${tx.purchased_at.slice(0, 7)}`),
  });

  // มาจากขั้นครอบและส่ง -> อ่านให้เลยครั้งเดียว
  useEffect(() => {
    if (params.get("auto") === "1" && !autoRan.current) {
      autoRan.current = true;
      extract.mutate();
    }
  }, [params, extract]);

  const warnings = result?.warnings ?? [];
  const confidence = result?.draft.confidence ?? {};

  /** ช่องไหนควรเตือน: AI ไม่มั่นใจ หรือถูกพูดถึงใน warnings */
  const warnSet = useMemo(() => {
    const set = new Set<string>();
    for (const [k, v] of Object.entries(confidence)) if (v < 0.7) set.add(k);
    if (warnings.some((w) => w.includes("ยอดรวม") || w.includes("ผลรวมรายการ"))) set.add("total");
    if (warnings.some((w) => w.includes("วันที่"))) set.add("issued_at");
    if (warnings.some((w) => w.includes("เลขผู้เสียภาษี"))) set.add("merchant_tax_id");
    return set;
  }, [confidence, warnings]);
  const warn = (k: string) => warnSet.has(k);

  const { data: merchantTypes = [] } = useMerchantTypes();
  const set = (k: keyof Form) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    // เปลี่ยนประเภทร้าน -> ตั้งหมวดของทุกรายการเป็นหมวดเริ่มต้นของร้านนั้น (ตามสเปก)
    if (k === "merchant_type") {
      setItems((xs) => applyMerchantDefault(xs, merchantTypes.find((t) => t.id === v)));
    }
  };
  /** ใบประกันภัยไม่มีรายการสินค้า — ข้อมูลกรมธรรม์อยู่ในกล่องข้อมูลร้านค้าแทน */
  const noItems = merchantTypes.find((t) => t.id === form.merchant_type)?.no_items ?? false;

  const totals = computeTotals(noItems ? [] : items, billDiscounts, form);
  const payable = totals.hasItems ? totals.payable : money(form.total);
  const conf = result?.scan_confidence;
  const lowConf = conf?.level === "low" || conf?.level === "medium";

  return (
    <div className="mx-auto max-w-xl space-y-4 pb-28">
      {result?.unsupported && !dismissed && (
        <UnsupportedDialog info={result.unsupported} onRescan={() => navigate("/add")} onContinue={closeDialog} />
      )}
      {showImage && <ImageViewer src={imageUrl(receiptId)} onClose={() => setShowImage(false)} />}

      <ScanHeader title="ตรวจสอบข้อมูล" step={3} onBack={() => navigate("/add")} />

      {/* แบนเนอร์ผลการอ่าน — กดรูปเล็กเพื่อดูใบเสร็จเต็มจอ */}
      <div className="flex items-center gap-3 rounded-3xl bg-pine-dark p-3 pr-4 text-white">
        <button
          type="button"
          onClick={() => setShowImage(true)}
          aria-label="ดูรูปใบเสร็จ"
          className="h-16 w-14 shrink-0 overflow-hidden rounded-lg bg-white"
        >
          <img src={imageUrl(receiptId)} alt="" className="h-full w-full object-cover object-top" />
        </button>
        <div className="min-w-0 flex-1">
          {reading ? (
            <>
              <p className="font-bold">กำลังอ่านใบเสร็จ…</p>
              <p className="text-sm text-white/70">ใช้เวลาสักครู่</p>
            </>
          ) : readError ? (
            <>
              <p className="font-bold">อ่านใบเสร็จไม่สำเร็จ</p>
              <p className="truncate text-sm text-white/70">{readError?.message}</p>
            </>
          ) : result ? (
            <>
              <p className="font-bold">{lowConf ? "อ่านแล้ว ควรตรวจก่อนบันทึก" : "อ่านใบเสร็จสำเร็จ"}</p>
              <p className="text-sm text-white/75">
                {conf?.score != null && <>เชื่อถือได้ {conf.score}% · </>}
                {conf?.score != null && (
                  <button type="button" onClick={() => setShowHow((v) => !v)} className="underline underline-offset-2">
                    คิดมายังไง?
                  </button>
                )}
              </p>
            </>
          ) : (
            <>
              <p className="font-bold">ยังไม่ได้อ่านใบเสร็จนี้</p>
              <p className="text-sm text-white/70">ให้ระบบอ่าน หรือกรอกเองด้านล่าง</p>
            </>
          )}
        </div>
        {reading ? (
          <span className="h-8 w-8 shrink-0 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />
        ) : result && !readError ? (
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${lowConf ? "bg-amber-400/90" : "bg-white/15"}`}>
            <CheckIcon className="h-5 w-5" />
          </span>
        ) : (
          <button type="button" onClick={() => extract.mutate()} className="btn shrink-0 bg-white text-pine">
            {readError ? "ลองอีกครั้ง" : "ให้ระบบอ่าน"}
          </button>
        )}
      </div>

      {showHow && conf && <ScanConfidenceCard conf={conf} initiallyOpen />}

      {result?.duplicate_of && (
        <DuplicateNotice
          dup={result.duplicate_of}
          onScanOther={() => navigate("/add")}
          onOpenExisting={() => navigate(`/monthly?month=${result.duplicate_of!.purchased_at.slice(0, 7)}`)}
        />
      )}

      {result?.unsupported && dismissed && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">{result.unsupported.title}</p>
          <p className="mt-0.5 text-xs">{result.unsupported.message}</p>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="mb-1 font-medium">ตรวจสอบก่อนบันทึก</p>
          <ul className="list-inside list-disc space-y-0.5">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <StoreSection form={form} onChange={set} warn={warn} />
      {!noItems && (
        <ItemsSection items={items} setItems={setItems} incomplete={result ? !result.draft.line_items_complete : false} />
      )}
      <DiscountVatSection form={form} onChange={set} billDiscounts={billDiscounts} setBillDiscounts={setBillDiscounts} />
      <PaymentSection form={form} onChange={set} warn={warn} />
      <SummaryCard form={form} onChange={set} items={noItems ? [] : items} billDiscounts={billDiscounts} warn={warn} />

      {result && (
        <button
          type="button"
          onClick={() => extract.mutate()}
          disabled={reading}
          className="w-full text-center text-sm text-ink/55 underline underline-offset-2"
        >
          ให้ระบบอ่านใบเสร็จนี้ซ้ำ
        </button>
      )}

      {save.isError && (
        <div className="rounded-2xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {(save.error as Error).message}
        </div>
      )}

      <StickyTotalBar
        amount={payable}
        onSave={() => save.mutate()}
        // ใบซ้ำบันทึกไม่ได้ (backend ก็ตอบ 409) — ถ้าผู้ใช้แก้ข้อมูลจนไม่ซ้ำแล้ว ให้กด "อ่านซ้ำ" ตรวจใหม่
        disabled={!canSave(form) || !form.merchant_type || Boolean(result?.duplicate_of)}
        pending={save.isPending}
      />
    </div>
  );
}

/** ดูรูปใบเสร็จเต็มจอ — แตะที่ใดก็ได้เพื่อปิด */
function ImageViewer({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={onClose} role="dialog" aria-label="รูปใบเสร็จ">
      <button type="button" aria-label="ปิด" className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white">
        <XIcon className="h-5 w-5" />
      </button>
      <img src={src} alt="ใบเสร็จ" className="max-h-full max-w-full rounded-lg object-contain" />
    </div>
  );
}
