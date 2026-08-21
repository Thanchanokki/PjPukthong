/**
 * แปลง UserDoc เป็น JSON ที่ frontend รออยู่ (snake_case, id) — ลำดับฟิลด์และ
 * ชนิดข้อมูลต้องตรงกับ frontend/src/api.ts
 */
import type { UserDoc } from "../../db/models.js";

/**
 * เขียนฟิลด์ทีละตัวโดยตั้งใจ ไม่ใช้ spread — passwordHash ห้ามหลุดออก API
 * ไม่ว่าจะเผลอเพิ่มฟิลด์อะไรลง UserDoc ในอนาคต
 */
export function userOut(u: UserDoc) {
  return {
    id: u._id,
    name: u.name,
    email: u.email,
    currency: u.currency,
    role: u.role,
  };
}
