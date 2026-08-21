/**
 * จัดการไฟล์รูปใบเสร็จ: normalize -> hash -> เก็บลงดิสก์
 *
 * ทุกรูปถูกแปลงเป็น JPEG ขนาดมาตรฐานก่อนเสมอ แล้วค่อยคิด sha256 จากไฟล์ที่ normalize แล้ว
 * เพื่อให้ dedupe เสถียร (ไฟล์เดิมที่ถูก re-encode ระหว่างทางยังคงได้ hash เดียวกัน)
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";

import { settings } from "../../config/index.js";

export const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

/** ข้อความภาษาไทยที่ส่งกลับให้ผู้ใช้อ่านได้ตรงๆ */
export class ImageError extends Error {}

/** HEIC/PNG/WebP -> JPEG, หมุนตาม EXIF, ย่อด้านยาว, ลบ metadata */
export async function normalizeImage(raw: Buffer): Promise<Buffer> {
  try {
    return await sharp(raw)
      // .rotate() ไม่ใส่อาร์กิวเมนต์ = หมุนตาม orientation ที่กล้องบันทึกไว้
      .rotate()
      .resize(settings.maxImageLongEdge, settings.maxImageLongEdge, {
        fit: "inside",
        withoutEnlargement: true,
      })
      // sharp ทิ้ง metadata ทั้งหมดโดย default -> พิกัด GPS หายไปด้วย
      .jpeg({ quality: 88 })
      .toBuffer();
  } catch (err) {
    throw new ImageError("เปิดไฟล์รูปไม่ได้ ไฟล์อาจเสียหรือไม่ใช่รูปภาพ", {
      cause: err,
    });
  }
}

export function sha256Hex(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export function storagePath(fileHash: string): string {
  return path.join(settings.uploadDir, fileHash.slice(0, 2), `${fileHash}.jpg`);
}

/** เขียนไฟล์ (ถ้ายังไม่มี) แล้วคืน storage_key ที่เก็บลง DB */
export async function save(data: Buffer, fileHash: string): Promise<string> {
  const full = storagePath(fileHash);
  await mkdir(path.dirname(full), { recursive: true });
  if (!existsSync(full)) await writeFile(full, data);
  return path.relative(settings.uploadDir, full);
}

export async function load(storageKey: string): Promise<Buffer> {
  const full = path.join(settings.uploadDir, storageKey);
  try {
    return await readFile(full);
  } catch (err) {
    throw new ImageError("ไม่พบไฟล์รูปในระบบ อาจถูกลบไปแล้ว", { cause: err });
  }
}
