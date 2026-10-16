/**
 * หน้า "เพิ่มรายการใหม่" — เลือกวิธีบันทึกใบเสร็จ
 *
 * - ถ่ายภาพใบเสร็จ (แนะนำ) -> /add/scan เปิดกล้องในหน้าเว็บ (ขั้น 1 ถ่าย · 2 ครอบ · 3 ตรวจสอบ)
 * - อัพโหลดจากคลังภาพ -> เลือกไฟล์ที่หน้านี้เลย แล้วไปขั้นครอบรูปของ /add/scan
 *   (เบราว์เซอร์มือถือเปิดตัวเลือกไฟล์ได้เฉพาะตอนผู้ใช้กด จึงต้องเปิดจากหน้านี้ ดู scanStore.ts)
 * - กรอกด้วยตนเอง -> /manual ฟอร์มเปล่า ไม่ผ่าน OCR
 */
import { useRef } from "react";
import { useNavigate } from "react-router-dom";

import { CameraIcon, ChevronRightIcon, ImageIcon, PencilIcon } from "../components/icons";
import { setPendingImage } from "../scanStore";

function OptionRow({
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
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-4 rounded-2xl bg-white px-4 py-4 text-left shadow-sm ring-1 ring-black/5 transition hover:shadow-md"
    >
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-mist text-pine">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-ink">{title}</span>
        <span className="block text-sm text-ink/55">{description}</span>
      </span>
      <ChevronRightIcon className="h-5 w-5 shrink-0 text-ink/35" />
    </button>
  );
}

export default function CapturePage() {
  const navigate = useNavigate();
  const galleryRef = useRef<HTMLInputElement>(null);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setPendingImage(file);
          navigate("/add/scan?step=crop");
        }}
      />

      <header className="space-y-1.5">
        <h1 className="text-2xl font-bold text-ink">เพิ่มรายการใหม่</h1>
        <p className="text-sm text-ink/60">เลือกวิธีบันทึก ระบบจะอ่านข้อมูลจากใบเสร็จให้อัตโนมัติด้วย OCR</p>
      </header>

      {/* ทางหลัก — การ์ดใหญ่ไล่สีเขียว */}
      <button
        type="button"
        onClick={() => navigate("/add/scan")}
        className="relative block w-full overflow-hidden rounded-3xl bg-gradient-to-br from-pine-dark via-pine to-pine-light p-5 text-left text-white shadow-lg transition hover:shadow-xl"
      >
        <span className="absolute right-4 top-4 rounded-full bg-white/20 px-3 py-1 text-xs font-medium">แนะนำ</span>
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/15">
          <CameraIcon className="h-6 w-6" />
        </span>
        <span className="mt-8 block text-xl font-bold">ถ่ายภาพใบเสร็จ</span>
        <span className="mt-1 block text-sm text-white/80">เปิดกล้องถ่ายทันที เหมาะกับใบเสร็จที่เพิ่งได้รับ</span>
        <span className="mt-5 flex flex-wrap items-center gap-x-2 text-xs text-white/75">
          <span>1 ถ่ายภาพ</span>
          <span aria-hidden="true">›</span>
          <span>2 ครอบและส่ง</span>
          <span aria-hidden="true">›</span>
          <span>3 ตรวจสอบ</span>
        </span>
      </button>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-ink/60">ทางเลือกอื่น</h2>
        <OptionRow
          icon={<ImageIcon className="h-6 w-6" />}
          title="อัพโหลดจากคลังภาพ"
          description="เลือกรูปที่ถ่ายไว้แล้วจากเครื่อง"
          onClick={() => galleryRef.current?.click()}
        />
        <OptionRow
          icon={<PencilIcon className="h-5 w-5" />}
          title="กรอกด้วยตนเอง"
          description="สำหรับกรณีไม่มีใบเสร็จ หรือ OCR อ่านไม่ได้"
          onClick={() => navigate("/manual")}
        />
      </section>
    </div>
  );
}
