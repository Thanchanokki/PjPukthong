/**
 * หน้า "เพิ่มรายการใหม่" — ให้เลือกวิธีบันทึกใบเสร็จก่อน (ถ่ายภาพ / อัพโหลดจากคลัง /
 * กรอกด้วยตนเอง) จากนั้นค่อยเข้าสู่ flow เดิม (พรีวิว -> อัปโหลด -> ผลลัพธ์)
 *
 * เดิมมี input เดียวที่ผูก capture="environment" ไว้ตายตัว ทำให้เลือกไม่ได้ว่าจะ
 * ถ่ายจริงหรือหยิบจากคลังภาพ จึงแยกเป็นสอง input ซ่อนไว้ และเพิ่มทางลัด
 * "กรอกด้วยตนเอง" ที่ข้ามการอัปโหลดไปเข้าฟอร์มเปล่าเลย
 *
 * "กรอกด้วยตนเอง" พาไปหน้า /manual (ManualPage.tsx) ที่ทำ flow กรอกเปล่าไว้แล้ว
 * โดยเฉพาะ ไม่ผ่าน /review/:receiptId ซึ่งเป็นของโหมด OCR
 */
import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { UploadResult, uploadReceipt } from "../api";
import { CameraIcon, PencilIcon, UploadIcon } from "../components/icons";

/** การ์ดตัวเลือกวิธีบันทึกใบเสร็จ — ประกาศนอก component หลักตามธรรมเนียมเดียวกับ FormFields.tsx */
function OptionCard({
  icon,
  title,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-start gap-4 rounded-2xl border border-stamp/20 bg-white
                 px-5 py-4 text-left shadow-sm transition hover:border-stamp hover:shadow-md"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-stamp/10 text-stamp">
        {icon}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-base font-bold text-ink">{title}</span>
        <span className="text-sm leading-snug text-ink/60">{description}</span>
      </span>
    </button>
  );
}

export default function CapturePage() {
  const navigate = useNavigate();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);

  const upload = useMutation({
    mutationFn: uploadReceipt,
    onSuccess: setResult,
  });

  function pick(file: File | undefined) {
    if (!file) return;
    setResult(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
    upload.mutate(file);
  }

  function reset() {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setResult(null);
    upload.reset();
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  }

  // แสดงหน้าเลือกวิธีบันทึกตราบใดที่ยังไม่มีรูปและไม่ได้กำลังอัปโหลดอยู่
  const showPicker = !preview && !upload.isPending;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      {/* input จริงถูกซ่อนไว้ การ์ดด้านล่างเป็นตัวสั่งเปิด — ตัวแรกบังคับกล้อง
          (capture="environment") ตัวที่สองเปิดคลังภาพปกติ */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0])}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0])}
      />

      {showPicker && (
        <div className="space-y-6">
          <div className="space-y-1.5">
            <h1 className="text-xl font-bold text-ink">เพิ่มรายการใหม่</h1>
            <p className="text-sm text-ink/60">
              เลือกวิธีบันทึกใบเสร็จ ระบบจะอ่านข้อมูลให้อัตโนมัติด้วย OCR
            </p>
          </div>

          <div className="space-y-3">
            <OptionCard
              icon={<CameraIcon className="h-6 w-6" />}
              title="ถ่ายภาพใบเสร็จ"
              description="เปิดกล้องถ่ายทันที เหมาะกับใบเสร็จที่เพิ่งได้รับ"
              onClick={() => cameraInputRef.current?.click()}
            />
            <OptionCard
              icon={<UploadIcon className="h-6 w-6" />}
              title="อัพโหลดจากคลังภาพ"
              description="เลือกรูปที่ถ่ายไว้แล้วจากเครื่อง"
              onClick={() => galleryInputRef.current?.click()}
            />
            <OptionCard
              icon={<PencilIcon className="h-6 w-6" />}
              title="กรอกด้วยตนเอง"
              description="สำหรับกรณีไม่มีใบเสร็จ หรือ OCR อ่านไม่ได้"
              onClick={() => navigate("/manual")}
            />
          </div>
        </div>
      )}

      {preview && (
        <img
          src={preview}
          alt="ใบเสร็จที่เลือก"
          className="max-h-[60vh] w-full rounded-xl border border-slate-200 bg-white object-contain"
        />
      )}

      {upload.isPending && (
        <p className="text-center text-sm text-slate-500">กำลังอัปโหลด…</p>
      )}

      {upload.isError && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {(upload.error as Error).message}
          <button onClick={reset} className="btn-ghost ml-3">
            ลองใหม่
          </button>
        </div>
      )}

      {result && (
        <div className="space-y-3">
          {result.duplicate && (
            <div className="rounded-lg border border-sky-300 bg-sky-50 p-3 text-sm text-sky-900">
              ℹ️ ใบเสร็จนี้เคยอัปโหลดแล้ว — ระบบจะใช้ใบเดิม ไม่สร้างซ้ำ
            </div>
          )}

          {result.blurry && (
            <div className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
              ⚠️ ภาพดูเบลอ (คะแนนความคม {result.blur_score?.toFixed(0)}) — ถ่ายใหม่ให้ชัดขึ้น
              จะช่วยให้ AI อ่านแม่นกว่ามาก
              <div className="mt-2">
                <button onClick={reset} className="btn-ghost">
                  ถ่ายใหม่
                </button>
              </div>
            </div>
          )}

          {/* ไม่ขึ้นซ้อนกับแบนเนอร์เบลอ — สองอันบอกเรื่องเดียวกันคือ "ภาพนี้อ่านยาก"
              แต่ OCR วัดจากตัวอักษรจริงจึงจับกรณีที่ภาพคมแต่หมึกจาง/ใบยับได้ด้วย */}
          {!result.blurry && result.ocr_low_quality && (
            <div className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
              ⚠️ OCR อ่านตัวอักษรได้ไม่ค่อยชัด (
              {Math.round((result.ocr_quality ?? 0) * 100)}%) — ใบเสร็จอาจหมึกจางหรือมีรอยยับ
              ถ่ายใหม่ในที่สว่างขึ้นจะช่วยได้ แต่กดให้ AI อ่านต่อเลยก็ได้
              <div className="mt-2">
                <button onClick={reset} className="btn-ghost">
                  ถ่ายใหม่
                </button>
              </div>
            </div>
          )}

          {/* ปุ่มหลักของแอป — ต้องเห็นง่าย กดครั้งเดียว ไม่ซ่อนไว้ลึก */}
          <button
            onClick={() => navigate(`/review/${result.receipt_id}?auto=1`)}
            className="btn-primary w-full py-4 text-base"
          >
            ✨ ให้ AI อ่านให้
          </button>

          <div className="flex gap-2">
            <button
              onClick={() => navigate(`/review/${result.receipt_id}`)}
              className="btn-ghost flex-1"
            >
              กรอกเอง
            </button>
            <button onClick={reset} className="btn-ghost flex-1">
              เลือกรูปอื่น
            </button>
          </div>
        </div>
      )}
    </div>
  );
}