/**
 * อ่านไฟล์รูปจาก multipart field "file" พร้อมตรวจชนิด/ขนาด — ใช้ร่วมกันทั้ง
 * รูปใบเสร็จและรูปโปรไฟล์ เพื่อให้กติกาและข้อความ error ตรงกันทุกที่
 */
import type { FastifyRequest } from "fastify";

import { maxUploadBytes, settings } from "../config/index.js";
import { httpError } from "./errors.js";

export const ALLOWED_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

/**
 * คืนเนื้อไฟล์ดิบ — ยังไม่ได้พิสูจน์ว่าเป็นรูปจริง (mimetype มาจาก client)
 * ผู้เรียกต้องให้ sharp เปิดดูอีกชั้น
 */
export async function readImageUpload(req: FastifyRequest): Promise<Buffer> {
  const part = await req.file();
  if (!part) throw httpError(400, "ไม่พบไฟล์ที่อัปโหลด");

  if (part.mimetype && !ALLOWED_IMAGE_MIME.has(part.mimetype.toLowerCase())) {
    throw httpError(
      415,
      `ไม่รองรับไฟล์ชนิด ${part.mimetype} (รองรับ JPEG, PNG, WebP, HEIC)`,
    );
  }

  let raw: Buffer;
  try {
    raw = await part.toBuffer();
  } catch (err) {
    throw httpError(413, `ไฟล์ใหญ่เกิน ${settings.maxUploadMb} MB`, err);
  }
  if (part.file.truncated || raw.length > maxUploadBytes) {
    throw httpError(413, `ไฟล์ใหญ่เกิน ${settings.maxUploadMb} MB`);
  }
  if (raw.length === 0) throw httpError(400, "ไฟล์ว่างเปล่า");

  return raw;
}
