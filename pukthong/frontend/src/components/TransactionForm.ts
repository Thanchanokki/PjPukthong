/**
 * ตรรกะฟอร์มที่หน้า "ตรวจใบเสร็จ" กับ "กรอกเอง" ใช้ร่วมกัน
 *
 * แยกออกมาเพื่อให้มีนิยามฟิลด์ชุดเดียว — เพิ่มฟิลด์ทีเดียวได้ทั้งสองหน้า
 */
import type { BillDiscount, LineItem, MerchantType, ReceiptDraft } from "../api";

/**
 * ไม่มีหมวดระดับใบเสร็จแล้ว — หมวดอยู่ที่ "ของแต่ละชิ้น" ที่เดียว
 *
 * มีสองที่พร้อมกันแล้วสับสน (ใบที่มีทั้งนมและแชมพูจะให้ตอบว่าทั้งใบคือหมวดอะไร?)
 * และ dashboard ก็สรุปจากหมวดรายชิ้นอยู่แล้ว ฟิลด์ระดับใบจึงไม่เคยถูกใช้จริง
 */
export type Form = {
  merchant_name: string;
  /** id ประเภทร้าน ("" = ยังไม่ได้เลือก) */
  merchant_type: string;
  branch: string;
  merchant_tax_id: string;
  doc_number: string;
  purchased_at: string;
  purchased_time: string;
  subtotal: string;
  discount: string;
  service_charge: string;
  vat_rate: string;
  vat_amount: string;
  total: string;
  payment_method: string;
  payment_channel: string;
  note: string;
  /** VAT บนใบ: none = ไม่มี | included = รวมในราคาแล้ว | excluded = แยกบวกเพิ่ม (ใช้คิดยอดในหน้าตรวจ) */
  vat_mode: "none" | "included" | "excluded";
  // ข้อมูลกรมธรรม์ — ใช้เฉพาะเมื่อประเภทร้านเป็นประกันภัย
  ins_insurer: string;
  ins_policy_number: string;
  ins_policy_type: string;
  ins_insured_name: string;
  ins_coverage_start: string;
  ins_coverage_end: string;
  ins_premium: string;
};

export const EMPTY: Form = {
  merchant_name: "",
  merchant_type: "",
  branch: "",
  merchant_tax_id: "",
  doc_number: "",
  purchased_at: "",
  purchased_time: "",
  subtotal: "",
  discount: "",
  service_charge: "",
  vat_rate: "",
  vat_amount: "",
  total: "",
  payment_method: "",
  payment_channel: "",
  note: "",
  vat_mode: "included",
  ins_insurer: "",
  ins_policy_number: "",
  ins_policy_type: "",
  ins_insured_name: "",
  ins_coverage_start: "",
  ins_coverage_end: "",
  ins_premium: "",
};

const s = (v: string | null | undefined) => v ?? "";

/** ค่า null จาก AI ต้องเว้นว่างไว้ให้ผู้ใช้กรอก ห้ามเติมค่ามั่ว */
export function draftToForm(d: ReceiptDraft): Form {
  return {
    ...EMPTY,
    merchant_name: s(d.merchant_name),
    merchant_type: s(d.merchant_type),
    branch: s(d.branch),
    merchant_tax_id: s(d.merchant_tax_id),
    doc_number: s(d.doc_number),
    purchased_at: s(d.issued_at),
    purchased_time: d.issued_time ? d.issued_time.slice(0, 5) : "",
    subtotal: s(d.subtotal),
    discount: s(d.discount),
    service_charge: s(d.service_charge),
    vat_rate: s(d.vat_rate),
    vat_amount: s(d.vat_amount),
    total: s(d.total),
    payment_method: s(d.payment_method),
    payment_channel: s(d.payment_channel),
    vat_mode: !d.vat_amount && !d.vat_rate ? "none" : d.vat_included === false ? "excluded" : "included",
    ins_insurer: s(d.insurance?.insurer),
    ins_policy_number: s(d.insurance?.policy_number),
    ins_policy_type: s(d.insurance?.policy_type),
    ins_insured_name: s(d.insurance?.insured_name),
    ins_coverage_start: s(d.insurance?.coverage_start),
    ins_coverage_end: s(d.insurance?.coverage_end),
    // ไม่มีเบี้ยแยก ใช้ยอดรวมของใบ (ใบเสร็จค่าเบี้ยส่วนใหญ่มีแค่ยอดเดียว)
    ins_premium: s(d.insurance?.premium ?? (d.merchant_type === "insurance" ? d.total : null)),
  };
}

/**
 * เปลี่ยนประเภทร้านแล้วตั้งหมวดของทุกรายการเป็นหมวดเริ่มต้นของร้านนั้น (ตามสเปก)
 * เช่น เปลี่ยนเป็นห้าง/แฟชั่น -> ทุกรายการเป็น "ช้อปปิ้ง" ผู้ใช้แก้รายชิ้นต่อได้
 * - ร้านที่จัดรายชิ้นได้บางหมวด (ร้านอาหาร: อาหาร/เครื่องดื่ม) คงหมวดเดิมไว้ถ้าอยู่ในชุดนั้น
 * - ร้านขายของปนกัน (ไม่มีหมวดเริ่มต้น) คงหมวดเดิมของแต่ละรายการไว้
 */
export function applyMerchantDefault(items: LineItem[], type: MerchantType | undefined): LineItem[] {
  const id = type?.default_category_id;
  if (!id) return items;
  const keep = new Set(type.item_category_ids ?? []);
  return items.map((it) => (it.category_id && keep.has(it.category_id) ? it : { ...it, category_id: id }));
}

const num = (v: string) => (v.trim() === "" ? null : v.trim());

/** วันที่วันนี้ตามเวลาเครื่อง (ไม่ใช้ toISOString เพราะจะเพี้ยนไปวันก่อนหน้าตาม timezone) */
export function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const emptyItem = (): LineItem => ({
  // บรรทัดที่ผู้ใช้กดเพิ่มเองตั้งต้นที่ 1 ชิ้น (ไม่ใช่การเดาแทนใบเสร็จ — บรรทัดนี้ยังว่างอยู่)
  qty: "",
  name: "",
  unit_price: null,
  gross_amount: null,
  discount: null,
  amount: null,
  flag: null,
  category_id: null,
});

/** ต้องมียอดรวมและวันที่ก่อนจึงจะบันทึกได้ (ตรงกับที่ backend บังคับ) */
export const canSave = (form: Form) =>
  form.total.trim() !== "" && form.purchased_at.trim() !== "";

/** แปลงฟอร์มเป็น payload ของ POST /api/transactions */
export function buildPayload(
  form: Form,
  items: LineItem[],
  receiptId: string | null,
  billDiscounts: BillDiscount[] = [],
) {
  const isInsurance = form.merchant_type === "insurance";
  return {
    receipt_id: receiptId,
    merchant_name: num(form.merchant_name),
    merchant_type: num(form.merchant_type),
    branch: num(form.branch),
    merchant_tax_id: num(form.merchant_tax_id),
    doc_number: num(form.doc_number),
    purchased_at: form.purchased_at,
    purchased_time: num(form.purchased_time),
    subtotal: num(form.subtotal),
    // ส่วนลดท้ายบิลส่งเป็นก้อน — backend รวมเป็น discount ของใบเอง
    discount: null,
    bill_discounts: billDiscounts,
    service_charge: num(form.service_charge),
    // เลือก "ไม่มี VAT" = ไม่ส่งตัวเลข VAT ที่อาจค้างอยู่ในช่อง
    vat_rate: form.vat_mode === "none" ? null : num(form.vat_rate),
    vat_amount: form.vat_mode === "none" ? null : num(form.vat_amount),
    total: form.total,
    payment_method: num(form.payment_method),
    payment_channel: num(form.payment_channel),
    note: num(form.note),
    // ใบประกันภัยไม่มีรายการสินค้า — ส่งข้อมูลกรมธรรม์แทน
    insurance: isInsurance
      ? {
          insurer: num(form.ins_insurer),
          policy_number: num(form.ins_policy_number),
          policy_type: num(form.ins_policy_type),
          insured_name: num(form.ins_insured_name),
          coverage_start: num(form.ins_coverage_start),
          coverage_end: num(form.ins_coverage_end),
          premium: num(form.ins_premium),
        }
      : null,
    items: isInsurance ? [] : items
      // บรรทัดที่ว่างทั้งชื่อและยอด ถือว่าผู้ใช้ไม่ได้ตั้งใจกรอก — ไม่ต้องส่ง
      .filter((it) => (it.name ?? "").trim() !== "" || (it.amount ?? "") !== "")
      .map((it, i) => ({
        line_no: i + 1,
        name: it.name,
        qty: it.qty,
        unit_price: it.unit_price,
        gross_amount: it.gross_amount ?? null,
        discount: it.discount ?? null,
        amount: it.amount,
        flag: it.flag,
        // AI เดาหมวดมาให้ตอนสแกน (category_guess) ผู้ใช้แก้ได้ที่ category_id
        category_id: it.category_id ?? it.category_guess ?? null,
      })),
  };
}
