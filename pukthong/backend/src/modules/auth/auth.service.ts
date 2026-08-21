/**
 * ตรรกะของบัญชีผู้ใช้ — controller ไม่ต้องรู้ว่าข้อมูลถูกเก็บที่ไหนหรือกันซ้ำอย่างไร
 *
 * ทุกฟังก์ชันที่นี่โยน httpError() ตรงๆ เพราะข้อความ error เป็นส่วนหนึ่งของ
 * ตรรกะ (เช่น "อีเมลหรือรหัสผ่านไม่ถูกต้อง" ที่ตั้งใจไม่แยกสองกรณี)
 */
import { randomUUID } from "node:crypto";

import { users } from "../../db/client.js";
import type { UserDoc } from "../../db/models.js";
import { httpError } from "../../shared/errors.js";
import type { LoginInput, RegisterInput } from "./auth.schema.js";
import { hashPassword, signToken, verifyPassword } from "./auth.security.js";

/** MongoDB คืนรหัสนี้เมื่อค่าชน unique index */
const DUPLICATE_KEY = 11000;

/**
 * สมัครสมาชิก — สำเร็จแล้วคืน token มาเลย ไม่ต้องให้ผู้ใช้กรอกรหัสผ่านซ้ำเพื่อล็อกอิน
 * (ของเดิมคืนแค่ข้อมูล user จึงต้องล็อกอินอีกรอบ)
 */
export async function register(input: RegisterInput) {
  const { name, email, password } = input;

  // เช็คก่อนเพื่อให้ได้ข้อความไทยที่ตรงประเด็น ส่วน unique index ด้านล่างคือกันซ้ำจริง
  if (await users.findOne({ email })) {
    throw httpError(409, "อีเมลนี้ถูกใช้ไปแล้ว");
  }

  const now = new Date();
  const doc: UserDoc = {
    _id: randomUUID(),
    name,
    email,
    passwordHash: await hashPassword(password),
    currency: "THB",
    role: "user",
    createdAt: now,
    updatedAt: now,
  };

  try {
    await users.insertOne(doc);
  } catch (err) {
    // สองคำขอที่มาพร้อมกันผ่าน findOne ข้างบนไปได้ทั้งคู่ — unique index จับที่นี่
    if ((err as { code?: number }).code === DUPLICATE_KEY) {
      throw httpError(409, "อีเมลนี้ถูกใช้ไปแล้ว", err);
    }
    throw err;
  }

  return { token: signToken(doc._id), user: doc };
}

export async function login(input: LoginInput) {
  const { email, password } = input;

  /**
   * ข้อความเดียวกันทั้งกรณี "ไม่มีอีเมลนี้" และ "รหัสผ่านผิด" โดยตั้งใจ
   * ถ้าแยกข้อความ คนนอกจะไล่เดาได้ว่าอีเมลไหนมีบัญชีอยู่ในระบบ
   */
  const user = await users.findOne({ email });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw httpError(401, "อีเมลหรือรหัสผ่านไม่ถูกต้อง");
  }

  return { token: signToken(user._id), user };
}

export async function getById(userId: string): Promise<UserDoc> {
  const user = await users.findOne({ _id: userId });
  // token ยังไม่หมดอายุ แต่บัญชีถูกลบไปแล้ว
  if (!user) throw httpError(401, "ไม่พบบัญชีผู้ใช้นี้");
  return user;
}
