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
  rawText: string | null;
  aiModel: string | null;
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
}

export interface TransactionDoc {
  _id: string;
  /** เจ้าของ = UserDoc._id — ทุก query ต้องกรองด้วยฟิลด์นี้ ไม่งั้นข้อมูลข้ามคน */
  userId: string;
  receiptId: string | null;
  /** income | expense */
  direction: string;
  merchantName: string | null;
  branch: string | null;
  merchantTaxId: string | null;
  docNumber: string | null;
  /** 'YYYY-MM-DD' */
  occurredOn: string;
  /** 'HH:MM:SS' */
  occurredAtTime: string | null;
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
