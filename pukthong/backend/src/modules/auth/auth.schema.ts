/** รูปร่างของ body ที่รับจากฟอร์มสมัครสมาชิก / เข้าสู่ระบบ */
import { z } from "zod";

import { emailField } from "../../shared/zod.js";

export const registerSchema = z.object({
  name: z.preprocess(
    (v) => (typeof v === "string" ? v.trim() : v),
    z
      .string({ required_error: "ต้องระบุชื่อ" })
      .min(1, "ต้องระบุชื่อ")
      .max(100, "ชื่อยาวเกิน 100 ตัวอักษร"),
  ),
  email: emailField,
  password: z
    .string({ required_error: "ต้องระบุรหัสผ่าน" })
    .min(8, "รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร")
    // bcrypt อ่านแค่ 72 ไบต์แรก ส่วนที่เกินถูกตัดทิ้งเงียบๆ — กันไว้ไม่ให้ผู้ใช้เข้าใจผิด
    .max(72, "รหัสผ่านยาวเกิน 72 ตัวอักษร"),
});

export type RegisterInput = z.infer<typeof registerSchema>;

/** ตอนล็อกอินไม่บังคับความยาว — รหัสผิดก็คือผิด ไม่ต้องบอกว่าผิดกฎข้อไหน */
export const loginSchema = z.object({
  email: emailField,
  password: z.string({ required_error: "ต้องระบุรหัสผ่าน" }).min(1, "ต้องระบุรหัสผ่าน"),
});

export type LoginInput = z.infer<typeof loginSchema>;
