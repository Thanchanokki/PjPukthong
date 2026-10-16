/**
 * แปลง UserDoc เป็น JSON ที่ frontend รออยู่ (snake_case, id) — ลำดับฟิลด์และ
 * ชนิดข้อมูลต้องตรงกับ frontend/src/api.ts
 */
import type { UserDoc } from "../../db/models.js";

/**
 * เขียนฟิลด์ทีละตัวโดยตั้งใจ ไม่ใช้ spread — passwordHash ห้ามหลุดออก API
 * ไม่ว่าจะเผลอเพิ่มฟิลด์อะไรลง UserDoc ในอนาคต
 */
export function userOut(u: UserDoc, token: string) {
  return {
    id: u._id,
    name: u.name,
    email: u.email,
    currency: u.currency,
    role: u.role,
    avatar_url: avatarUrl(u, token),
  };
}

/**
 * frontend ใส่ URL นี้ลง <img src> ตรงๆ ซึ่งแนบ Authorization header ไม่ได้
 * จึงต่อ token ท้าย URL แบบเดียวกับ imageUrl() ของรูปใบเสร็จ
 *
 * ?v= เปลี่ยนทุกครั้งที่อัปรูปใหม่ — ไม่งั้น browser แสดงรูปเก่าจาก cache
 * เพราะ path เดิมทุกครั้ง
 */
function avatarUrl(u: UserDoc, token: string): string | null {
  if (!u.avatarKey) return null;
  const version = u.avatarUpdatedAt?.getTime() ?? 0;
  return `/api/auth/me/avatar?v=${version}&token=${encodeURIComponent(token)}`;
}
