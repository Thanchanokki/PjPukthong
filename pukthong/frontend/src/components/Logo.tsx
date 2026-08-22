/**
 * โลโก้ Pukthong — ใช้ซ้ำได้ทุกที่ในแอป
 *
 * ไฟล์ SVG อยู่ใน public/ (Vite เสิร์ฟที่ root) จึงอ้างด้วย absolute path ได้เลย
 *   public/logo-pukthong.svg        โลโก้เต็ม (ตัว P + PUKTHONG)
 *   public/logo-pukthong-mark.svg   เฉพาะสัญลักษณ์ตัว P
 *
 * ตัวอย่าง:
 *   <Logo />                              // lockup สูง 28px — ขนาดเท่า header เดิมเป๊ะ
 *   <Logo variant="full" height={140} />  // หน้า login / register
 *   <Logo variant="mark" height={24} />   // ที่แคบ ๆ
 */

export type LogoVariant = "mark" | "full" | "lockup";

interface LogoProps {
  /**
   * mark   – เฉพาะตัว P (ทรงเกือบจัตุรัส เหมาะกับที่แคบ)
   * full   – โลโก้เต็มมีคำว่า PUKTHONG อยู่ในภาพ (ทรงตั้ง ต้องการพื้นที่สูง)
   * lockup – ตัว P + คำว่า "Pukthong" เป็น text ข้าง ๆ (ทรงนอน เหมาะกับ header)
   */
  variant?: LogoVariant;
  /** ความสูงของสัญลักษณ์เป็น px — ตอน lockup ขนาดตัวอักษรจะสเกลตามให้อัตโนมัติ */
  height?: number;
  className?: string;
  /** ข้อความใน alt และคำที่แสดงข้างโลโก้ตอน variant="lockup" */
  title?: string;
}

const SRC = {
  mark: "/logo-pukthong-mark.svg",
  full: "/logo-pukthong.svg",
} as const;

// อัตราส่วนจริงของไฟล์ ใส่ไว้กัน layout shift ตอนรูปยังโหลดไม่เสร็จ
const RATIO = {
  mark: 627 / 584,
  full: 624 / 738,
} as const;

export function Logo({
  variant = "lockup",
  height = 28,
  className = "",
  title = "Pukthong",
}: LogoProps) {
  const kind = variant === "full" ? "full" : "mark";
  const width = Math.round(height * RATIO[kind]);

  const img = (
    <img
      src={SRC[kind]}
      alt={variant === "lockup" ? "" : title}
      aria-hidden={variant === "lockup" || undefined}
      width={width}
      height={height}
      decoding="async"
      className="block w-auto shrink-0"
      style={{ height }}
    />
  );

  if (variant !== "lockup") {
    return <span className={`inline-block ${className}`}>{img}</span>;
  }

  return (
    <span
      className={`inline-flex items-center ${className}`}
      style={{ gap: Math.round(height * 0.29) }}
    >
      {img}
      {/* height=28 -> fontSize 18px ซึ่งเท่ากับ text-lg เดิมใน header พอดี */}
      <span
        className="font-semibold leading-none text-teal-800"
        style={{ fontSize: Math.round(height * 0.64) }}
      >
        {title}
      </span>
    </span>
  );
}

export default Logo;