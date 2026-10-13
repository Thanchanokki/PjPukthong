/**
 * รายรับ — "ข้อมูลจำลอง" ล้วนๆ
 *
 * backend ตัดระบบรายรับออกไปแล้ว (ดู Transaction.direction ใน api.ts: คอมเมนต์บอกว่า
 * "ตอนนี้เป็น expense เสมอ (ระบบรายรับถูกตัดออก)") หน้าแรกจึงยังดึงยอดรายรับจริงไม่ได้
 *
 * ใส่ค่าจำลองไว้ก่อนให้การ์ด "รายรับ/คงเหลือ" มีตัวเลขให้ดูตามดีไซน์ ตัวเลขเปลี่ยน
 * ตามเดือนแบบ deterministic (เดือนเดิมกลับมาดูก็ได้ค่าเดิม) ไม่ใช่สุ่มใหม่ทุกครั้ง
 *
 * ⚠️ ลบไฟล์นี้และเปลี่ยนไปเรียก endpoint จริงทันทีที่ backend มีระบบรายรับกลับมา
 */
const BASE_INCOME = 18_500;

export function mockIncomeFor(month: string): number {
  const m = Number(month.slice(5, 7)) || 1;
  const scale = 0.85 + ((m * 53) % 30) / 100;
  return Math.round(BASE_INCOME * scale);
}