/**
 * เอกสารที่ระบบ "ไม่รองรับ" — ตัดสินจากผลที่ AI อ่านมา แล้วส่งไปให้ frontend เด้งป๊อปอัพเตือน
 *
 * ไม่ได้ปฏิเสธการบันทึก: ผู้ใช้อาจรู้อยู่แล้วและอยากกรอกต่อเอง เราแค่บอกให้ชัดว่า
 * ผลที่อ่านมาเชื่อไม่ได้เพราะอะไร และแนะนำให้ถ่ายใบเสร็จตัวจริงแทน
 *
 * - สลิปโอนเงิน: มีแค่ยอดโอนกับชื่อผู้รับ ไม่มีรายการสินค้า จัดหมวดรายชิ้นไม่ได้
 *   และมักซ้ำกับใบเสร็จของร้านที่ผู้ใช้สแกนอีกใบ (ยอดเดียวกันถูกนับสองครั้ง)
 * - บิลเขียนมือ: OCR/AI อ่านลายมือผิดบ่อย ตัวเลขที่ได้จึงเชื่อถือไม่ได้
 * - ไม่ใช่ใบเสร็จ: รูปผิด — ไม่มีอะไรให้บันทึก
 */
import type { ReceiptDraft } from "./receipts.schema.js";

export type UnsupportedKind = "transfer_slip" | "handwritten" | "not_receipt";

export interface Unsupported {
  kind: UnsupportedKind;
  /** หัวข้อป๊อปอัพ */
  title: string;
  /** อธิบายว่าทำไมไม่รองรับ และควรทำอะไรต่อ */
  message: string;
}

export function unsupportedReason(d: ReceiptDraft): Unsupported | null {
  const type = d.document_type?.toUpperCase() ?? null;

  if (type === "NOT_RECEIPT") {
    return {
      kind: "not_receipt",
      title: "รูปนี้ไม่ใช่ใบเสร็จ",
      message: "ระบบไม่พบข้อมูลการซื้อขายในรูปนี้ ลองเลือกรูปใบเสร็จใหม่อีกครั้ง",
    };
  }
  if (type === "TRANSFER_SLIP") {
    return {
      kind: "transfer_slip",
      title: "ยังไม่รองรับสลิปโอนเงิน",
      message:
        "สลิปจากแอปธนาคารไม่มีรายการสินค้า ระบบจึงแยกหมวดให้ไม่ได้ " +
        "แนะนำให้สแกนใบเสร็จจากร้านแทน หรือกรอกรายการเองต่อจากหน้านี้",
    };
  }
  if (d.handwritten) {
    return {
      kind: "handwritten",
      title: "ยังไม่รองรับบิลเขียนมือ",
      message:
        "ระบบอ่านลายมือได้ไม่แม่นยำ ตัวเลขที่อ่านได้อาจผิด " +
        "ตรวจทุกช่องให้ละเอียดก่อนบันทึก หรือกรอกรายการเองแทน",
    };
  }
  return null;
}
