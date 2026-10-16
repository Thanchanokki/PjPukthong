/**
 * flow สแกนใบเสร็จ ขั้น 1 "ถ่ายใบเสร็จ" และขั้น 2 "ครอบและส่ง" — ขั้น 3 คือ ReviewPage
 *
 * ขั้น 1 เปิดกล้องในหน้าเว็บ (getUserMedia) พร้อมกรอบนำสายตา และเช็คสองข้อจากภาพจริง:
 *   - แสงพอ: ความสว่างเฉลี่ยของภาพ
 *   - ภาพนิ่ง: ภาพสองเฟรมติดกันต่างกันน้อย (มือไม่สั่น)
 * ไม่มีเช็ค "เห็นยอดรวม" เพราะต้องอ่านตัวอักษร (OCR) ทำสดในเบราว์เซอร์ไม่ได้ — ไม่แสดงสิ่งที่ตรวจไม่ได้จริง
 *
 * กล้องในหน้าเว็บใช้ได้เฉพาะ https หรือ localhost (เปิดผ่าน IP ในวง LAN แบบ http ใช้ไม่ได้)
 * เปิดไม่ได้ = ใช้กล้องของโทรศัพท์ผ่าน <input capture> แทน
 *
 * ขั้น 2 ลากกรอบเลือกเฉพาะตัวใบเสร็จ + หมุนรูป แล้วส่งเฉพาะส่วนที่ครอบ — ตอนทดสอบ OCR
 * พบว่าใบที่กินพื้นที่เล็กๆ ในรูปอ่านพลาดมากกว่า ครอบให้ใบเต็มกรอบช่วยให้อ่านแม่นขึ้น
 */
import { useMutation } from "@tanstack/react-query";
import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { type UploadResult, uploadReceipt } from "../api";
import { DuplicateNotice } from "../components/DuplicateNotice";
import { ScanHeader } from "../components/ScanHeader";
import { CheckIcon, FlashIcon, ImageIcon, RotateIcon } from "../components/icons";
import { takePendingImage } from "../scanStore";

// ---------------------------------------------------------------- เกณฑ์ของการเช็คภาพ

/** ความสว่างเฉลี่ย 0–255 ต่ำกว่านี้ = แสงน้อย ตัวอักษรบนใบความร้อนจะจาง */
const MIN_BRIGHTNESS = 70;
/** ค่าเฉลี่ยความต่างระหว่างสองเฟรม สูงกว่านี้ = มือสั่น/กำลังขยับ */
const MAX_MOTION = 7;
const SAMPLE_MS = 300;

type Rect = { x: number; y: number; w: number; h: number }; // สัดส่วน 0–1 ของรูป
const FULL: Rect = { x: 0.04, y: 0.03, w: 0.92, h: 0.94 };
const MIN_SIZE = 0.12;

type Shot = { blob: Blob; url: string };

function toShot(blob: Blob): Shot {
  return { blob, url: URL.createObjectURL(blob) };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

const canvasBlob = (c: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error("แปลงรูปไม่สำเร็จ"))), "image/jpeg", 0.92),
  );

// ---------------------------------------------------------------- หน้า

export default function ScanPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [shot, setShot] = useState<Shot | null>(null);
  /** มาจากคลังภาพ = ปุ่มย้อนกลับในขั้นครอบพากลับหน้าเลือกวิธี ไม่ใช่กลับไปกล้อง */
  const [fromGallery, setFromGallery] = useState(false);

  useEffect(() => {
    if (params.get("step") !== "crop") return;
    const file = takePendingImage();
    if (file) {
      setFromGallery(true);
      setShot(toShot(file));
    }
  }, [params]);

  // คืนหน่วยความจำของรูปเก่าทุกครั้งที่เปลี่ยนรูป
  useEffect(() => () => void (shot && URL.revokeObjectURL(shot.url)), [shot]);

  if (!shot) {
    return (
      <CameraStep
        onBack={() => navigate("/add")}
        onCapture={(blob, gallery) => {
          setFromGallery(gallery);
          setShot(toShot(blob));
        }}
      />
    );
  }
  return (
    <CropStep
      shot={shot}
      onReplace={(blob) => setShot(toShot(blob))}
      onBack={() => (fromGallery ? navigate("/add") : setShot(null))}
      retakeLabel={fromGallery ? "เลือกรูปใหม่" : "ถ่ายใหม่"}
      onUploaded={(r) => navigate(`/review/${r.receipt_id}?auto=1`, { replace: true })}
      onOpenExisting={(month) => navigate(`/monthly?month=${month}`)}
    />
  );
}

// ---------------------------------------------------------------- ขั้น 1: กล้อง

function CameraStep({
  onBack,
  onCapture,
}: {
  onBack: () => void;
  onCapture: (blob: Blob, fromGallery: boolean) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nativeRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [bright, setBright] = useState<boolean | null>(null);
  const [steady, setSteady] = useState<boolean | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torch, setTorch] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // เปิดกล้องหลัง ขอความละเอียดสูงไว้ก่อน — ตัวอักษรบนใบเสร็จเล็ก ยิ่งชัดยิ่งอ่านแม่น
  useEffect(() => {
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("เบราว์เซอร์นี้เปิดกล้องในหน้าเว็บไม่ได้ (ต้องเปิดผ่าน https)");
      return;
    }
    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 2560 }, height: { ideal: 1440 } },
      })
      .then((stream) => {
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        const caps = (track.getCapabilities?.() ?? {}) as { torch?: boolean };
        setTorchSupported(Boolean(caps.torch));
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      })
      .catch((e: Error) =>
        setError(
          e.name === "NotAllowedError"
            ? "ไม่ได้รับอนุญาตให้ใช้กล้อง — อนุญาตในการตั้งค่าเบราว์เซอร์ หรือใช้กล้องของโทรศัพท์แทน"
            : "เปิดกล้องไม่ได้ — ใช้กล้องของโทรศัพท์แทนได้",
        ),
      );
    return () => {
      cancelled = true;
      stop();
    };
  }, [stop]);

  // เช็คแสง/ความนิ่งจากภาพจริงทุก 300ms ด้วยภาพย่อ 64px (เบา ไม่กินแบต)
  useEffect(() => {
    if (!ready) return;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    let prev: Uint8ClampedArray | null = null;
    const id = window.setInterval(() => {
      const v = videoRef.current;
      if (!v || !ctx || !v.videoWidth) return;
      canvas.width = 64;
      canvas.height = Math.max(1, Math.round((64 * v.videoHeight) / v.videoWidth));
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const n = data.length / 4;
      const luma = new Uint8ClampedArray(n);
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const l = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
        luma[i] = l;
        sum += l;
      }
      setBright(sum / n >= MIN_BRIGHTNESS);
      if (prev) {
        let diff = 0;
        for (let i = 0; i < n; i++) diff += Math.abs(luma[i] - prev[i]);
        setSteady(diff / n <= MAX_MOTION);
      }
      prev = luma;
    }, SAMPLE_MS);
    return () => window.clearInterval(id);
  }, [ready]);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch((t) => !t);
    } catch {
      setTorchSupported(false);
    }
  }

  async function capture() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    setCapturing(true);
    try {
      const c = document.createElement("canvas");
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      c.getContext("2d")!.drawImage(v, 0, 0);
      const blob = await canvasBlob(c);
      stop();
      onCapture(blob, false);
    } finally {
      setCapturing(false);
    }
  }

  const allGood = bright && steady;
  const status = !ready
    ? "กำลังเปิดกล้อง…"
    : allGood
      ? "พร้อมถ่ายแล้ว"
      : bright === false
        ? torchSupported
          ? "แสงน้อย ลองเปิดแฟลช"
          : "แสงน้อย ย้ายไปที่สว่างขึ้น"
        : "ถือกล้องให้นิ่ง";

  const pick = (gallery: boolean) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) {
      stop();
      onCapture(file, gallery);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <input ref={nativeRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={pick(false)} />
      <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={pick(true)} />

      <ScanHeader title="ถ่ายใบเสร็จ" step={1} onBack={onBack} />
      <p className="text-center text-sm text-ink/70">วางใบเสร็จให้อยู่ในกรอบ บนพื้นเรียบและมีแสงพอ</p>

      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-3xl bg-pine-dark">
        {error ? (
          <div className="grid h-full place-items-center p-8 text-center text-sm text-white/80">
            <div className="space-y-4">
              <p>{error}</p>
              <button type="button" onClick={() => nativeRef.current?.click()} className="btn bg-white text-pine">
                เปิดกล้องของโทรศัพท์
              </button>
            </div>
          </div>
        ) : (
          <video
            ref={videoRef}
            playsInline
            muted
            onLoadedData={() => setReady(true)}
            className="h-full w-full object-cover"
          />
        )}

        {!error && (
          <>
            {/* กรอบนำสายตา — มุมสี่ด้าน */}
            <div className="pointer-events-none absolute inset-6 bottom-16">
              {["left-0 top-0 border-l-4 border-t-4 rounded-tl-2xl", "right-0 top-0 border-r-4 border-t-4 rounded-tr-2xl", "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl", "bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl"].map(
                (c) => (
                  <span key={c} className={`absolute h-10 w-10 border-mint ${c}`} />
                ),
              )}
            </div>
            <span
              className={`absolute left-1/2 top-5 -translate-x-1/2 rounded-full px-4 py-1.5 text-sm font-medium text-white shadow ${
                allGood ? "bg-pine" : "bg-black/50"
              }`}
              aria-live="polite"
            >
              {status}
            </span>
            <div className="absolute inset-x-0 bottom-4 flex justify-center gap-6 text-sm text-white">
              <CheckChip ok={bright} label="แสงพอ" />
              <CheckChip ok={steady} label="ภาพนิ่ง" />
            </div>
          </>
        )}
      </div>

      <div className="flex items-start justify-between px-4 pt-1">
        <RoundButton
          label="แฟลช"
          active={torch}
          disabled={!torchSupported}
          onClick={toggleTorch}
          icon={<FlashIcon className="h-6 w-6" />}
        />
        <div className="flex flex-col items-center gap-1.5">
          <button
            type="button"
            aria-label="ถ่ายภาพ"
            disabled={capturing || (!ready && !error)}
            onClick={() => (error ? nativeRef.current?.click() : capture())}
            className="grid h-24 w-24 place-items-center rounded-full border-4 border-pine bg-white transition active:scale-95 disabled:opacity-60"
          >
            <span className="h-[4.75rem] w-[4.75rem] rounded-full bg-gradient-to-br from-pine to-pine-light" />
          </button>
          <span className="text-sm text-ink/70">ถ่ายภาพ</span>
        </div>
        <RoundButton
          label="คลังภาพ"
          onClick={() => galleryRef.current?.click()}
          icon={<ImageIcon className="h-6 w-6" />}
        />
      </div>
    </div>
  );
}

function CheckChip({ ok, label }: { ok: boolean | null; label: string }) {
  return (
    <span className={`flex items-center gap-1.5 ${ok ? "text-white" : "text-white/50"}`}>
      <CheckIcon className={`h-4 w-4 ${ok ? "text-mint" : ""}`} />
      {label}
    </span>
  );
}

function RoundButton({
  label,
  icon,
  onClick,
  active = false,
  disabled = false,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 pt-3">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-pressed={active}
        aria-label={label}
        className={`grid h-16 w-16 place-items-center rounded-full shadow-sm ring-1 ring-black/5 transition disabled:opacity-40 ${
          active ? "bg-pine text-white" : "bg-white text-pine"
        }`}
      >
        {icon}
      </button>
      <span className="text-sm text-ink/70">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------- ขั้น 2: ครอบและส่ง

type Drag = { mode: "move" | "nw" | "ne" | "sw" | "se"; startX: number; startY: number; start: Rect };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function CropStep({
  shot,
  onReplace,
  onBack,
  retakeLabel,
  onUploaded,
  onOpenExisting,
}: {
  shot: Shot;
  onReplace: (blob: Blob) => void;
  onBack: () => void;
  retakeLabel: string;
  onUploaded: (r: UploadResult) => void;
  onOpenExisting: (month: string) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<Rect>(FULL);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [rotating, setRotating] = useState(false);
  /** อัปโหลดแล้วภาพเบลอ/อ่านยาก — ให้ผู้ใช้เลือกว่าจะถ่ายใหม่หรืออ่านต่อ */
  const [warn, setWarn] = useState<UploadResult | null>(null);
  /** รูปนี้เคยสแกนและบันทึกแล้ว — หยุดตรงนี้ ไม่พาไปหน้าตรวจสอบ */
  const [saved, setSaved] = useState<UploadResult["saved_as"]>(null);

  useEffect(() => setRect(FULL), [shot.url]);

  const upload = useMutation({
    mutationFn: async () => {
      const img = await loadImage(shot.url);
      const sx = Math.round(rect.x * img.naturalWidth);
      const sy = Math.round(rect.y * img.naturalHeight);
      const sw = Math.round(rect.w * img.naturalWidth);
      const sh = Math.round(rect.h * img.naturalHeight);
      const c = document.createElement("canvas");
      c.width = sw;
      c.height = sh;
      c.getContext("2d")!.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      const blob = await canvasBlob(c);
      return uploadReceipt(new File([blob], "receipt.jpg", { type: "image/jpeg" }));
    },
    onSuccess: (r) => {
      if (r.saved_as) setSaved(r.saved_as);
      else if (r.blurry || r.ocr_low_quality) setWarn(r);
      else onUploaded(r);
    },
  });

  /** หมุนตัวรูปจริง 90° ตามเข็ม (ไม่ใช่แค่หมุนการแสดงผล) — ส่วนที่ส่งไปจะหมุนตามด้วย */
  async function rotate() {
    setRotating(true);
    try {
      const img = await loadImage(shot.url);
      const c = document.createElement("canvas");
      c.width = img.naturalHeight;
      c.height = img.naturalWidth;
      const ctx = c.getContext("2d")!;
      ctx.translate(c.width, 0);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, 0, 0);
      onReplace(await canvasBlob(c));
    } finally {
      setRotating(false);
    }
  }

  const begin = (mode: Drag["mode"]) => (e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setDrag({ mode, startX: e.clientX, startY: e.clientY, start: rect });
  };

  function onMove(e: ReactPointerEvent) {
    if (!drag || !boxRef.current) return;
    const box = boxRef.current.getBoundingClientRect();
    const dx = (e.clientX - drag.startX) / box.width;
    const dy = (e.clientY - drag.startY) / box.height;
    const s = drag.start;
    if (drag.mode === "move") {
      setRect({ ...s, x: clamp(s.x + dx, 0, 1 - s.w), y: clamp(s.y + dy, 0, 1 - s.h) });
      return;
    }
    let { x, y, w, h } = s;
    if (drag.mode.includes("w")) {
      const nx = clamp(s.x + dx, 0, s.x + s.w - MIN_SIZE);
      w = s.w + (s.x - nx);
      x = nx;
    } else {
      w = clamp(s.w + dx, MIN_SIZE, 1 - s.x);
    }
    if (drag.mode.includes("n")) {
      const ny = clamp(s.y + dy, 0, s.y + s.h - MIN_SIZE);
      h = s.h + (s.y - ny);
      y = ny;
    } else {
      h = clamp(s.h + dy, MIN_SIZE, 1 - s.y);
    }
    setRect({ x, y, w, h });
  }

  const handle = (mode: Drag["mode"], pos: string) => (
    <span
      onPointerDown={begin(mode)}
      className={`absolute h-7 w-7 touch-none ${pos}`}
      style={{ cursor: `${mode}-resize` }}
      aria-hidden="true"
    >
      <span className="absolute inset-1.5 rounded-full border-2 border-white bg-pine shadow" />
    </span>
  );

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <ScanHeader title="ครอบและส่ง" step={2} onBack={onBack} />
      <p className="text-center text-sm text-ink/70">ลากมุมกรอบให้พอดีกับตัวใบเสร็จ ระบบจะอ่านเฉพาะในกรอบ</p>

      <div className="flex justify-center rounded-3xl bg-pine-dark p-4">
        <div
          ref={boxRef}
          className="relative inline-block touch-none select-none overflow-hidden"
          onPointerMove={onMove}
          onPointerUp={() => setDrag(null)}
          onPointerCancel={() => setDrag(null)}
        >
          <img src={shot.url} alt="ใบเสร็จที่ถ่าย" draggable={false} className="block max-h-[58vh] max-w-full" />
          {/* กรอบครอบ — เงานอกกรอบทำให้ส่วนที่จะถูกตัดทิ้งมืดลง */}
          <div
            onPointerDown={begin("move")}
            className="absolute cursor-move border-2 border-mint"
            style={{
              left: `${rect.x * 100}%`,
              top: `${rect.y * 100}%`,
              width: `${rect.w * 100}%`,
              height: `${rect.h * 100}%`,
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
            }}
          >
            {handle("nw", "-left-3.5 -top-3.5")}
            {handle("ne", "-right-3.5 -top-3.5")}
            {handle("sw", "-bottom-3.5 -left-3.5")}
            {handle("se", "-bottom-3.5 -right-3.5")}
          </div>
        </div>
      </div>

      {saved ? (
        <DuplicateNotice
          dup={saved}
          onScanOther={onBack}
          onOpenExisting={() => onOpenExisting(saved.purchased_at.slice(0, 7))}
        />
      ) : warn ? (
        <div className="space-y-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">
            {warn.blurry ? "ภาพดูเบลอ" : "ตัวอักษรบนใบอ่านได้ไม่ค่อยชัด"} — ถ่ายใหม่จะช่วยให้อ่านแม่นขึ้นมาก
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onBack} className="btn-ghost flex-1">
              {retakeLabel}
            </button>
            <button type="button" onClick={() => onUploaded(warn)} className="btn flex-1 bg-pine text-white hover:bg-pine-dark">
              อ่านต่อเลย
            </button>
          </div>
        </div>
      ) : (
        <>
          {upload.isError && (
            <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">
              {(upload.error as Error).message}
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onBack} className="btn-ghost flex-1 py-3">
              {retakeLabel}
            </button>
            <button
              type="button"
              onClick={rotate}
              disabled={rotating || upload.isPending}
              aria-label="หมุนรูป 90 องศา"
              className="btn-ghost px-4 py-3"
            >
              <RotateIcon className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => upload.mutate()}
              disabled={upload.isPending || rotating}
              className="btn flex-[2] bg-pine py-3 text-white hover:bg-pine-dark"
            >
              {upload.isPending ? "กำลังส่ง…" : "ส่งให้ระบบอ่าน"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
