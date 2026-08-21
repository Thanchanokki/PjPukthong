/**
 * ตรรกะฟอร์มที่หน้า "ตรวจใบเสร็จ" กับ "กรอกเอง" ใช้ร่วมกัน
 *
 * แยกออกมาเพื่อให้มีนิยามฟิลด์ชุดเดียว — เพิ่มฟิลด์ทีเดียวได้ทั้งสองหน้า
 */
import type { LineItem, ReceiptDraft } from "../api";

export type Form = {
  direction: "income" | "expense";
  merchant_name: string;
  branch: string;
  merchant_tax_id: string;
  doc_number: string;
  occurred_on: string;
  occurred_at_time: string;
  subtotal: string;
  discount: string;
  service_charge: string;
  vat_rate: string;
  vat_amount: string;
  total: string;
  category: string;
  payment_method: string;
  payment_channel: string;
  note: string;
};

export const EMPTY: Form = {
  direction: "expense",
  merchant_name: "",
  branch: "",
  merchant_tax_id: "",
  doc_number: "",
  occurred_on: "",
  occurred_at_time: "",
  subtotal: "",
  discount: "",
  service_charge: "",
  vat_rate: "",
  vat_amount: "",
  total: "",
  category: "",
  payment_method: "",
  payment_channel: "",
  note: "",
};

const s = (v: string | null | undefined) => v ?? "";

/** ค่า null จาก AI ต้องเว้นว่างไว้ให้ผู้ใช้กรอก ห้ามเติมค่ามั่ว */
export function draftToForm(d: ReceiptDraft): Form {
  return {
    ...EMPTY,
    merchant_name: s(d.merchant_name),
    branch: s(d.branch),
    merchant_tax_id: s(d.merchant_tax_id),
    doc_number: s(d.doc_number),
    occurred_on: s(d.issued_at),
    occurred_at_time: d.issued_time ? d.issued_time.slice(0, 5) : "",
    subtotal: s(d.subtotal),
    discount: s(d.discount),
    service_charge: s(d.service_charge),
    vat_rate: s(d.vat_rate),
    vat_amount: s(d.vat_amount),
    total: s(d.total),
    payment_method: s(d.payment_method),
    payment_channel: s(d.payment_channel),
  };
}

const num = (v: string) => (v.trim() === "" ? null : v.trim());

/** วันที่วันนี้ตามเวลาเครื่อง (ไม่ใช้ toISOString เพราะจะเพี้ยนไปวันก่อนหน้าตาม timezone) */
export function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const emptyItem = (): LineItem => ({
  qty: null,
  name: "",
  unit_price: null,
  amount: null,
  flag: null,
});

/** ต้องมียอดรวมและวันที่ก่อนจึงจะบันทึกได้ (ตรงกับที่ backend บังคับ) */
export const canSave = (form: Form) =>
  form.total.trim() !== "" && form.occurred_on.trim() !== "";

/** แปลงฟอร์มเป็น payload ของ POST /api/transactions */
export function buildPayload(
  form: Form,
  items: LineItem[],
  receiptId: string | null,
) {
  return {
    receipt_id: receiptId,
    direction: form.direction,
    merchant_name: num(form.merchant_name),
    branch: num(form.branch),
    merchant_tax_id: num(form.merchant_tax_id),
    doc_number: num(form.doc_number),
    occurred_on: form.occurred_on,
    occurred_at_time: num(form.occurred_at_time),
    subtotal: num(form.subtotal),
    discount: num(form.discount),
    service_charge: num(form.service_charge),
    vat_rate: num(form.vat_rate),
    vat_amount: num(form.vat_amount),
    total: form.total,
    category: num(form.category),
    payment_method: num(form.payment_method),
    payment_channel: num(form.payment_channel),
    note: num(form.note),
    items: items
      // บรรทัดที่ว่างทั้งชื่อและยอด ถือว่าผู้ใช้ไม่ได้ตั้งใจกรอก — ไม่ต้องส่ง
      .filter((it) => (it.name ?? "").trim() !== "" || (it.amount ?? "") !== "")
      .map((it, i) => ({
        line_no: i + 1,
        name: it.name,
        qty: it.qty,
        unit_price: it.unit_price,
        amount: it.amount,
        flag: it.flag,
      })),
  };
}
