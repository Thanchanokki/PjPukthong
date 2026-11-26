/**
 * การแสดงวันที่ของทั้งแอป — ให้ทุกหน้าพูดภาษาเดียวกัน
 *
 * กติกา: "วันที่ซื้อ" (purchased_at = วันที่บนใบเสร็จ) เป็นวันที่หลักและเป็นตัวตัดสินว่ายอด
 * ไปอยู่เดือนไหนเสมอ ส่วน "สแกนเมื่อ" (uploaded_at) เป็นข้อมูลรอง แสดงเมื่อจำเป็นเท่านั้น
 * ปีแสดงเป็น พ.ศ. ทุกจุด
 *
 * ทุกฟังก์ชันใช้เวลาท้องถิ่นของเครื่อง — toISOString() เป็น UTC ช่วงตี 0–7 โมงไทยจะได้วันผิด
 */

const MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
const MONTHS_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];
const WEEKDAYS_SHORT = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

const pad = (n: number) => String(n).padStart(2, "0");

/** 'YYYY-MM-DD' ของ Date ตามเวลาท้องถิ่น */
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** 'YYYY-MM' ของเดือนปัจจุบัน */
export const currentMonth = () => isoDate(new Date()).slice(0, 7);
/** 'YYYY-MM-DD' หรือ ISO datetime -> 'YYYY-MM' */
export const monthOf = (date: string) => date.slice(0, 7);

/** 'YYYY-MM-DD' -> Date เที่ยงคืนท้องถิ่น (new Date('YYYY-MM-DD') เป็น UTC ทำให้วันเลื่อน) */
const parseDate = (date: string) => {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const shiftMonth = (month: string, n: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

/** 'YYYY-MM' -> "พฤศจิกายน 2569" */
export function monthName(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y + 543}`;
}

/** 'YYYY-MM' -> "พ.ย. 2569" */
export function monthShort(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS_SHORT[m - 1]} ${y + 543}`;
}

/** "28 ต.ค. 69" — withWeekday: "จ. 17 พ.ย. 69" */
export function shortDate(date: string, withWeekday = false): string {
  const d = parseDate(date);
  const text = `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${String(d.getFullYear() + 543).slice(-2)}`;
  return withWeekday ? `${WEEKDAYS_SHORT[d.getDay()]} ${text}` : text;
}

/** จำนวนวันจากวันนี้ (บวก = อนาคต, ลบ = อดีต) */
export function daysFromToday(date: string): number {
  const today = parseDate(isoDate(new Date()));
  return Math.round((parseDate(date).getTime() - today.getTime()) / 86_400_000);
}

/** หัวกลุ่ม/ป้ายวัน: "วันนี้" · "เมื่อวาน" · "จ. 17 พ.ย. 69" */
export function dayLabel(date: string): string {
  const diff = daysFromToday(date);
  if (diff === 0) return "วันนี้";
  if (diff === -1) return "เมื่อวาน";
  return shortDate(date, true);
}

/** ห่างจากวันนี้เกินนี้ (หรืออยู่ในอนาคต) = เตือนให้ตรวจปีบนใบเสร็จ */
export const DATE_WARN_DAYS = 60;

/**
 * วันที่ซื้อที่น่าสงสัย — AI สลับ พ.ศ./ค.ศ. หรืออ่านปีผิด
 * คืน null ถ้าปกติ, ไม่งั้นคืนจำนวนวันที่ห่าง และวันที่ที่น่าจะถูก (วัน-เดือนเดิม ปีที่ใกล้วันนี้ที่สุดแต่ไม่เกินวันนี้)
 */
export function suspiciousDate(date: string): { days: number; suggestion: string | null } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const days = daysFromToday(date);
  if (days <= 0 && days >= -DATE_WARN_DAYS) return null;
  const today = new Date();
  const md = date.slice(5);
  let suggestion: string | null = `${today.getFullYear()}-${md}`;
  if (daysFromToday(suggestion) > 0) suggestion = `${today.getFullYear() - 1}-${md}`;
  const s = daysFromToday(suggestion);
  if (Number.isNaN(s) || s < -DATE_WARN_DAYS || suggestion === date) suggestion = null;
  return { days, suggestion };
}
