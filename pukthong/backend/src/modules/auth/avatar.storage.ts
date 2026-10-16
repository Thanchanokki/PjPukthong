/**
 * ไฟล์รูปโปรไฟล์ — คนละกติกากับรูปใบเสร็จ: ไม่ dedupe ไม่เก็บประวัติ
 * 1 คน = 1 ไฟล์ที่ avatars/<userId>.jpg อัปโหลดใหม่ก็เขียนทับของเดิม
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import { settings } from "../../config/index.js";
import { httpError } from "../../shared/errors.js";

/** แสดงจริงแค่วงกลมเล็กๆ — 512px พอสำหรับจอ retina และไฟล์ยังเล็ก */
const AVATAR_SIZE = 512;

/** หมุนตาม EXIF, ครอปเป็นสี่เหลี่ยมจัตุรัสตรงกลาง, ลบ metadata (รวมพิกัด GPS) */
async function normalizeAvatar(raw: Buffer): Promise<Buffer> {
  try {
    return await sharp(raw)
      .rotate()
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover" })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch (err) {
    // mimetype บอกว่าเป็นรูปแต่ sharp เปิดไม่ได้ = ไฟล์ปลอมหรือเสีย
    throw httpError(400, "เปิดไฟล์รูปไม่ได้ ไฟล์อาจเสียหรือไม่ใช่รูปภาพ", err);
  }
}

/** เขียนทับรูปเดิมของ user แล้วคืน storage key ที่เก็บลง DB */
export async function saveAvatar(userId: string, raw: Buffer): Promise<string> {
  const data = await normalizeAvatar(raw);
  const key = path.join("avatars", `${userId}.jpg`);
  const full = path.join(settings.uploadDir, key);
  await mkdir(path.dirname(full), { recursive: true });
  // เขียนไฟล์ชั่วคราวแล้วค่อย rename — คนที่กำลังโหลดรูปอยู่จะไม่เจอไฟล์ครึ่งๆ กลางๆ
  const tmp = `${full}.${process.pid}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, full);
  return key;
}

export async function loadAvatar(key: string): Promise<Buffer> {
  try {
    return await readFile(path.join(settings.uploadDir, key));
  } catch (err) {
    throw httpError(404, "ไม่พบรูปโปรไฟล์", err);
  }
}
