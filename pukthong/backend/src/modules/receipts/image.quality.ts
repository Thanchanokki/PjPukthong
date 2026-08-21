/**
 * เช็คคุณภาพรูปก่อนส่งไปให้ AI
 *
 * ทำที่ backend ไม่ใช่ frontend เพราะ BLUR_THRESHOLD อยู่ใน .env ของ backend
 * และเราอยากเตือนผู้ใช้ *ก่อน* ที่จะเสียค่าเรียก API กับรูปที่อ่านไม่ออก
 */
import sharp from "sharp";

import { settings } from "../../config/index.js";

/**
 * variance of Laplacian — ยิ่งต่ำยิ่งเบลอ
 * ใช้ kernel [[0,1,0],[1,-4,1],[0,1,0]] ตัวเดียวกับ cv2.Laplacian(ksize=1)
 * คืน null ถ้าอ่านรูปไม่ได้ (ไม่ให้พังทั้ง request เพราะแค่เช็คคุณภาพ)
 */
export async function blurScore(jpegBytes: Buffer): Promise<number | null> {
  try {
    const { data, info } = await sharp(jpegBytes)
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width: w, height: h } = info;
    if (w < 3 || h < 3) return null;

    // เดินเฉพาะพิกเซลด้านใน ข้ามขอบ 1 พิกเซล — ผลต่างกับการ pad ขอบแบบ OpenCV
    // ไม่มีนัยสำคัญกับรูปขนาดจริง แต่โค้ดง่ายกว่ามาก
    let n = 0;
    let mean = 0;
    let m2 = 0; // Welford — คำนวณ variance ผ่านเดียวโดยไม่เก็บ array ทั้งรูป
    for (let y = 1; y < h - 1; y++) {
      const row = y * w;
      for (let x = 1; x < w - 1; x++) {
        const i = row + x;
        const lap =
          data[i - w] + data[i - 1] + data[i + 1] + data[i + w] - 4 * data[i];
        n++;
        const delta = lap - mean;
        mean += delta / n;
        m2 += delta * (lap - mean);
      }
    }
    return n > 1 ? m2 / n : null;
  } catch {
    return null;
  }
}

/** ไม่รู้คะแนน = ไม่เตือน (ปล่อยให้ผู้ใช้ตัดสินใจเอง ดีกว่าเตือนมั่ว) */
export function isBlurry(score: number | null): boolean {
  if (score === null) return false;
  return score < settings.blurThreshold;
}
