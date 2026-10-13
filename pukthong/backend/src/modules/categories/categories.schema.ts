import { z } from "zod";

const name = z
  .string({ required_error: "ต้องระบุชื่อหมวด" })
  .trim()
  .min(1, "ต้องระบุชื่อหมวด")
  .max(40, "ชื่อหมวดยาวเกิน 40 ตัวอักษร");

/** อีโมจิหนึ่งตัวอาจยาวหลาย code unit (เช่น 👨‍👩‍👧) จึงเผื่อความยาวไว้ */
const icon = z
  .string()
  .trim()
  .max(16, "ไอคอนยาวเกินไป")
  .transform((v) => v || null)
  .nullable();

const color = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "สีต้องอยู่ในรูปแบบ #RRGGBB")
  .nullable();

const parentId = z
  .preprocess((v) => (v === "" ? null : v), z.string().nullable());

export const categoryCreateSchema = z.object({
  name,
  parent_id: parentId.optional(),
  icon: icon.optional(),
  color: color.optional(),
});

export const categoryUpdateSchema = z.object({
  name: name.optional(),
  parent_id: parentId.optional(),
  icon: icon.optional(),
  color: color.optional(),
  sort_order: z.number().int().min(0).max(10_000).optional(),
  is_active: z.boolean().optional(),
});

export type CategoryCreate = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdate = z.infer<typeof categoryUpdateSchema>;
