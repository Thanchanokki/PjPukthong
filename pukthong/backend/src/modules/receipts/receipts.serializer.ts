/** แปลง ReceiptDoc เป็น JSON ที่ frontend รออยู่ (snake_case) */
import type { ReceiptDoc } from "../../db/models.js";

/** blur_score เป็นค่าคุณภาพรูป ไม่ใช่เงิน — เก็บเป็น number ได้ปลอดภัย */
export const blurOut = (v: number | null | undefined) =>
  v === null || v === undefined ? null : v;

export function receiptRawOut(r: ReceiptDoc) {
  return {
    status: r.status,
    ai_model: r.aiModel,
    blur_score: blurOut(r.blurScore),
    raw_payload: r.rawPayload,
  };
}
