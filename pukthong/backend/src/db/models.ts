/**
 * รูปร่างของ document ใน MongoDB — ใช้แทน table schema ของ SQL เดิม
 *
 * กติกาที่ห้ามพลาด:
 * - `_id` เป็น UUID string ที่เราสร้างเอง (ไม่ใช่ ObjectId) เพราะ API/frontend
 *   ส่ง id เป็น UUID มาตั้งแต่ต้น และ requireUuid() ยังตรวจรูปแบบเดิม
 * - เงินทุกก้อนเก็บเป็น "string" ไม่ใช่ number — BSON double เป็น float 64 บิต
 *   ซึ่งทำให้ยอดเพี้ยนเงียบๆ แบบเดียวกับที่ money.ts เตือนไว้
 * - วันที่ของรายการเก็บเป็น 'YYYY-MM-DD' string เพราะเรียงและเทียบช่วงเดือน
 *   แบบ lexicographic ได้ตรงกับ DATE ของเดิม โดยไม่ต้องยุ่งกับ timezone
 * - รายการย่อยฝังอยู่ใน transaction เลย (ไม่แยก collection) — เขียนทีเดียวจบ
 *   จึง atomic โดยไม่ต้องใช้ multi-document transaction ซึ่ง mongod
 *   แบบ standalone (ไม่ใช่ replica set) ไม่รองรับ
 */

/**
 * บัญชีผู้ใช้ — ย้ายมาจากฝั่งที่ทำ login/register (เดิมเป็น Mongoose model)
 *
 * `_id` เป็น UUID string ตามกติกาด้านบน ไม่ใช่ ObjectId แบบที่ Mongoose สร้างให้
 * เพื่อให้ id ทุกชนิดในระบบนี้หน้าตาเหมือนกันหมด
 *
 * เก็บได้เฉพาะ hash เท่านั้น — รหัสผ่านจริงห้ามแตะฐานข้อมูล
 */
export interface UserDoc {
  _id: string;
  name: string;
  /** เก็บเป็นตัวพิมพ์เล็กที่ trim แล้วเสมอ — unique index จะได้ไม่ถูกหลบด้วย "A@x" vs "a@x" */
  email: string;
  passwordHash: string;
  currency: string;
  /** user | admin */
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReceiptDoc {
  _id: string;
  /** เจ้าของ = UserDoc._id — ทุก query ต้องกรองด้วยฟิลด์นี้ ไม่งั้นข้อมูลข้ามคน */
  userId: string;
  storageKey: string;
  fileHash: string;
  /** uploaded | extracted | confirmed | failed */
  status: string;
  blurScore: number | null;
  rawPayload: Record<string, unknown> | null;
  /**
   * ข้อความทั้งใบ — มาจาก Cloud Vision ถ้า OCR ทำงาน ไม่งั้นมาจากที่ AI ถอดเอง
   *
   * ของ OCR เชื่อถือได้กว่าเพราะเป็นตัวอักษรที่อ่านจากพิกเซลจริง ไม่ใช่สิ่งที่โมเดล
   * "จำได้ว่าเห็น" — receipts.service จึงเขียนทับด้วยของ OCR เสมอเมื่อมี
   */
  rawText: string | null;
  aiModel: string | null;
  /** ข้อความดิบจาก Cloud Vision — เก็บแยกไว้เพื่อไม่ให้ปนกับผลของ AI ตอน debug */
  ocrText: string | null;
  /** ความมั่นใจเฉลี่ยของ OCR 0–1 (null = ไม่ได้ทำ OCR หรือทำแล้วไม่รู้คะแนน) */
  ocrQuality: number | null;
  createdAt: Date;
}

export interface TransactionItemDoc {
  lineNo: number | null;
  name: string | null;
  qty: string | null;
  unitPrice: string | null;
  amount: string | null;
  /** ตัวอักษรกำกับราคาบนใบเสร็จ (เช่น N) — prompt สั่งห้ามตัดทิ้ง */
  flag: string | null;
  /**
   * หมวดค่าใช้จ่ายของของชิ้นนี้ (ดู shared/categories.ts) — null = ยังไม่ได้จัดหมวด
   *
   * เก็บที่ระดับรายการ ไม่ใช่ระดับใบเสร็จ เพราะใบเดียวมักมีของหลายหมวดปนกัน
   * (7-11 ใบเดียวมีทั้งนมและแชมพู) — dashboard จึงสรุปว่าเงินไปกับอะไรได้จริง
   */
  category: string | null;
}

export interface TransactionDoc {
  _id: string;
  /** เจ้าของ = UserDoc._id — ทุก query ต้องกรองด้วยฟิลด์นี้ ไม่งั้นข้อมูลข้ามคน */
  userId: string;
  receiptId: string | null;
  /**
   * income | expense — ตอนนี้เขียนเป็น "expense" เสมอ เพราะระบบรายรับถูกตัดออกไปก่อน
   *
   * ไม่ลบฟิลด์ทิ้งเพราะข้อมูลเดิมยังมีค่านี้อยู่ และถ้าวันหลังเอารายรับกลับมา
   * จะได้ไม่ต้อง migrate ทั้ง collection — API ไม่รับค่านี้จากผู้ใช้แล้ว
   */
  direction: string;
  merchantName: string | null;
  branch: string | null;
  merchantTaxId: string | null;
  docNumber: string | null;
  /**
   * วันที่บนใบเสร็จ 'YYYY-MM-DD' — เวลาที่เหตุการณ์จริงเกิดขึ้น
   *
   * ใช้ทำรายงาน สรุปยอดรายเดือน เคลมภาษี เช็คระยะประกัน — ทุกอย่างที่ตอบคำถามว่า
   * "เงินก้อนนี้ถูกใช้ไปเมื่อไหร่" ห้ามเอา uploadedAt มาใช้แทนเด็ดขาด เพราะถ่ายใบเก่า
   * เมื่อไหร่ยอดจะไปโผล่ผิดเดือนทันที
   */
  purchasedAt: string;
  /** เวลาบนใบเสร็จ 'HH:MM:SS' (ถ้าใบนั้นพิมพ์มา) */
  purchasedTime: string | null;
  /**
   * เวลาที่ระบบรับรู้รายการนี้ — ใบที่สแกนใช้เวลาที่ "อัปโหลดรูป" ไม่ใช่เวลาที่กดบันทึก
   * ส่วนรายการที่กรอกเองใช้เวลาที่กดบันทึก
   *
   * ใช้เรียงลำดับใน feed, sync, audit, debug, กู้ข้อมูล — ทุกอย่างที่ตอบคำถามว่า
   * "ระบบรู้เรื่องนี้เมื่อไหร่" ไม่เกี่ยวกับยอดเงินรายเดือนเลย
   *
   * ไม่เปลี่ยนตอนแก้ไขรายการ (นั่นคือหน้าที่ของ updatedAt)
   */
  uploadedAt: Date;
  currency: string;
  subtotal: string | null;
  discount: string | null;
  serviceCharge: string | null;
  vatRate: string | null;
  vatAmount: string | null;
  total: string;
  category: string | null;
  paymentMethod: string | null;
  paymentChannel: string | null;
  note: string | null;
  verifiedByUser: boolean;
  items: TransactionItemDoc[];
  createdAt: Date;
  updatedAt: Date;
}
