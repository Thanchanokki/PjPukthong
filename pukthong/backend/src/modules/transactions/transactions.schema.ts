/**
 * ชั้นนี้บังคับค่าได้ เพราะผู้ใช้ตรวจข้อมูลแล้วกดบันทึกเอง
 * (ต่างจาก receipts.schema ที่รับผลดิบจาก AI จึงปล่อย null ได้ทุกฟิลด์)
 *
 * ไม่มี direction แล้ว — ระบบรายรับถูกตัดออก ทุกรายการที่บันทึกผ่าน API นี้คือรายจ่าย
 * (service เป็นคนเขียน "expense" ลง DB ให้เอง ผู้ใช้ส่งค่ามาไม่ได้)
 */
import { z } from "zod";

import { toDecimalString } from "../../shared/money.js";
import {
  currencyField,
  decField,
  intField,
  strField,
  toDateString,
  toTimeString,
} from "../../shared/zod.js";

const requiredDecimal = z
  .preprocess(toDecimalString, z.string({ required_error: "ต้องระบุยอดรวม" }).nullable())
  .refine((v): v is string => v !== null, { message: "ต้องระบุยอดรวมเป็นตัวเลข" });

/** วันที่บนใบเสร็จ — บังคับ เพราะเป็นแกนของการสรุปยอดรายเดือนทั้งหมด */
const requiredDate = z
  .preprocess(toDateString, z.string().nullable())
  .refine((v): v is string => v !== null, {
    message: "ต้องระบุวันที่ในรูปแบบ YYYY-MM-DD",
  });

/**
 * หมวดที่ผู้ใช้เลือก — รับ category_id เป็นหลัก ส่วน category (ชื่อหมวด) รับไว้ให้ client
 * รุ่นเก่า service เป็นคนแปลงเป็น id และเช็คว่าเป็นหมวดที่ผู้ใช้คนนี้เลือกได้จริง
 * (ทำใน schema ไม่ได้เพราะต้องรู้ว่าใครเป็นคนส่ง — แต่ละคนมีหมวดของตัวเอง)
 */
const categoryFields = { category_id: strField, category: strField };

export const transactionItemSchema = z.object({
  line_no: intField,
  name: strField,
  qty: decField,
  unit_price: decField,
  amount: decField,
  flag: strField,
  ...categoryFields,
});

export const transactionCreateSchema = z.object({
  receipt_id: z.preprocess(
    (v) => (v === "" ? null : v),
    z.string().uuid({ message: "receipt_id ไม่ใช่ UUID ที่ถูกต้อง" }).nullish(),
  ),
  merchant_name: strField,
  merchant_type: strField,
  branch: strField,
  merchant_tax_id: strField,
  doc_number: strField,
  purchased_at: requiredDate,
  purchased_time: z.preprocess(toTimeString, z.string().nullable()),
  currency: currencyField,
  subtotal: decField,
  discount: decField,
  service_charge: decField,
  vat_rate: decField,
  vat_amount: decField,
  total: requiredDecimal,
  ...categoryFields,
  payment_method: strField,
  payment_channel: strField,
  note: strField,
  items: z.preprocess((v) => (Array.isArray(v) ? v : []), z.array(transactionItemSchema)),
});

export type TransactionCreate = z.infer<typeof transactionCreateSchema>;
