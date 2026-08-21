/**
 * ชั้นนี้บังคับค่าได้ เพราะผู้ใช้ตรวจข้อมูลแล้วกดบันทึกเอง
 * (ต่างจาก receipts.schema ที่รับผลดิบจาก AI จึงปล่อย null ได้ทุกฟิลด์)
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

const requiredDate = z
  .preprocess(toDateString, z.string().nullable())
  .refine((v): v is string => v !== null, {
    message: "ต้องระบุวันที่ในรูปแบบ YYYY-MM-DD",
  });

export const transactionItemSchema = z.object({
  line_no: intField,
  name: strField,
  qty: decField,
  unit_price: decField,
  amount: decField,
  flag: strField,
});

export const transactionCreateSchema = z.object({
  receipt_id: z.preprocess(
    (v) => (v === "" ? null : v),
    z.string().uuid({ message: "receipt_id ไม่ใช่ UUID ที่ถูกต้อง" }).nullish(),
  ),
  direction: z.enum(["income", "expense"]).default("expense"),
  merchant_name: strField,
  branch: strField,
  merchant_tax_id: strField,
  doc_number: strField,
  occurred_on: requiredDate,
  occurred_at_time: z.preprocess(toTimeString, z.string().nullable()),
  currency: currencyField,
  subtotal: decField,
  discount: decField,
  service_charge: decField,
  vat_rate: decField,
  vat_amount: decField,
  total: requiredDecimal,
  category: strField,
  payment_method: strField,
  payment_channel: strField,
  note: strField,
  items: z.preprocess((v) => (Array.isArray(v) ? v : []), z.array(transactionItemSchema)),
});

export type TransactionCreate = z.infer<typeof transactionCreateSchema>;
