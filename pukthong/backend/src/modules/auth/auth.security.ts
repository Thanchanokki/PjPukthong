/**
 * ชั้นตรวจตัวตน — ย้ายมาจากฝั่งที่ทำ login/register (เดิมเป็น Express middleware + controller)
 *
 * ของเดิมตอบ error เป็น {"message": "..."} แต่ทั้งระบบนี้ตอบ {"detail": "..."} และ
 * frontend/src/api.ts อ่านแค่ body.detail — จึงโยน httpError() เหมือน endpoint อื่นทุกตัว
 */
import bcrypt from "bcryptjs";
import type { FastifyReply, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";

import { requireJwtSecret, settings } from "../../config/index.js";
import { httpError } from "../../shared/errors.js";

/** cost 10 เท่าเดิม — สูงกว่านี้ทำให้ล็อกอินหน่วงจนรู้สึกได้ */
const BCRYPT_COST = 10;

export const hashPassword = (plain: string) => bcrypt.hash(plain, BCRYPT_COST);

export const verifyPassword = (plain: string, hash: string) =>
  bcrypt.compare(plain, hash);

export function signToken(userId: string): string {
  return jwt.sign({ id: userId }, requireJwtSecret(), {
    expiresIn: settings.jwtExpiresIn,
  } as jwt.SignOptions);
}

/** คืน userId ถ้า token ใช้ได้ — โยน 401 ถ้าหมดอายุ ปลอม หรือรูปแบบผิด */
function userIdFromToken(token: string): string {
  let payload: unknown;
  try {
    payload = jwt.verify(token, requireJwtSecret());
  } catch (err) {
    throw httpError(401, "Token ไม่ถูกต้องหรือหมดอายุ", err);
  }
  const id = (payload as { id?: unknown })?.id;
  if (typeof id !== "string" || !id) {
    throw httpError(401, "Token ไม่ถูกต้องหรือหมดอายุ");
  }
  return id;
}

/**
 * ให้ req.userId มี type ทั้งโปรเจกต์ — route ที่ผ่าน requireAuth แล้วใช้ได้เลย
 * ไม่ต้อง cast
 */
declare module "fastify" {
  interface FastifyRequest {
    userId: string;
  }
}

/**
 * ใช้เป็น preHandler hook — ใส่ที่หัว plugin แล้วครอบทุก route ใน plugin นั้น
 * (Fastify แยก scope ต่อ plugin ให้อยู่แล้ว จึงไม่รั่วไปโดน /api/health)
 */
export async function requireAuth(req: FastifyRequest, _reply: FastifyReply) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw httpError(401, "ไม่ได้เข้าสู่ระบบ");
  }
  req.userId = userIdFromToken(header.slice("Bearer ".length).trim());
}

/**
 * <img src> แนบ header เองไม่ได้ — route รูปใบเสร็จจึงยอมรับ token ผ่าน ?token= ด้วย
 * ใช้เฉพาะ GET ที่อ่านอย่างเดียวเท่านั้น (token ใน URL ติดไปกับ log/history ของ browser)
 */
export async function requireAuthAllowQueryToken(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const fromQuery = (req.query as { token?: unknown } | undefined)?.token;
  if (!req.headers.authorization && typeof fromQuery === "string" && fromQuery) {
    req.userId = userIdFromToken(fromQuery);
    return;
  }
  await requireAuth(req, reply);
}
