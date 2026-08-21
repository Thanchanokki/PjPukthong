import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { UploadResult, uploadReceipt } from "../api";

export default function CapturePage() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
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
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0])}
      />

      {!preview && (
        <button
          onClick={() => inputRef.current?.click()}
          className="flex h-64 w-full flex-col items-center justify-center gap-2 rounded-2xl
                     border-2 border-dashed border-slate-300 bg-white text-slate-500
                     hover:border-teal-500 hover:text-teal-700"
        >
          <span className="text-4xl">📷</span>
          <span className="font-medium">ถ่ายรูป หรือเลือกรูปใบเสร็จ</span>
          <span className="text-xs">JPEG, PNG, WebP, HEIC · ไม่เกิน 15 MB</span>
        </button>
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
