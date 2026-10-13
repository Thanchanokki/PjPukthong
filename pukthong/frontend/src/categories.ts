/**
 * หมวดค่าใช้จ่าย — ดึงจาก backend (GET /api/categories) ไม่ได้ประกาศตายตัวในโค้ดแล้ว
 *
 * ผู้ใช้สร้างหมวดเองได้ รายชื่อจึงต่างกันไปแต่ละคน และ backend เป็นที่เดียวที่รู้ครบ
 * ทุกที่ที่ต้องใช้รายชื่อหมวด (ดรอปดาวน์ หน้างบ หน้าจัดการหมวด) ใช้ hook ตัวนี้
 * จึงแชร์ cache ก้อนเดียว — สร้างหมวดใหม่แล้ว invalidate ทีเดียวเห็นทุกหน้า
 */
import { useQuery } from "@tanstack/react-query";

import { type Category, fetchCategories } from "./api";

/** ชื่อหมวดที่ระบบใช้รองรับเงินที่จัดกลุ่มไม่ได้ — dashboard อธิบายเพิ่มให้ผู้ใช้เข้าใจ */
export const FALLBACK = "อื่นๆ";

export const CATEGORIES_KEY = ["categories"] as const;

/** หมวดที่เปิดอยู่ทั้งหมด (หมวดกลาง + ของผู้ใช้) เรียงตามที่ backend จัดไว้ */
export function useCategories() {
  return useQuery({
    queryKey: [...CATEGORIES_KEY, "active"],
    queryFn: () => fetchCategories(false),
    // รายชื่อหมวดแทบไม่เปลี่ยน — ไม่ต้องยิงใหม่ทุกครั้งที่สลับหน้า
    staleTime: 5 * 60_000,
  });
}

/** จัดเป็นหมวดหลักพร้อมหมวดย่อยของแต่ละตัว — ใช้ทำ <optgroup> และหน้าจัดการหมวด */
export function groupCategories(list: Category[]) {
  const roots = list.filter((c) => !c.parent_id);
  return roots.map((root) => ({
    root,
    children: list.filter((c) => c.parent_id === root.id),
  }));
}

export const labelOf = (c: Pick<Category, "name" | "icon">) =>
  c.icon ? `${c.icon} ${c.name}` : c.name;
