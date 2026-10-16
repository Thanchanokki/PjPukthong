/**
 * แปลง TransactionDoc จาก MongoDB (camelCase, _id) เป็น JSON ที่ frontend รออยู่
 * (snake_case, id) ลำดับฟิลด์และชนิดข้อมูลต้องตรงกับ frontend/src/api.ts ทุกตัว
 */
import type { InsuranceDoc, TransactionDoc, TransactionItemDoc } from "../../db/models.js";
import { policyTypeOf } from "../../shared/insurance.js";
import { merchantTypeOf } from "../../shared/merchant-types.js";
import type { CategoryBook } from "../categories/categories.service.js";

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/**
 * เดิมรายการย่อยเป็นแถวในตารางจึงมี id ของตัวเอง ตอนนี้ฝังอยู่ใน transaction แล้ว
 * แต่ frontend ยังประกาศ type ว่ามี id: number — ใช้ลำดับในอาเรย์แทน
 */
/**
 * DB เก็บแค่ categoryId — ชื่อหมวดเปิดหาจาก book ตอนส่งออก จึงเปลี่ยนชื่อหมวด
 * ทีเดียวแล้วรายการเก่าเปลี่ยนตามหมด (category = ชื่อ ไว้แสดงผล, category_id ไว้แก้ไข)
 */
export function itemOut(r: TransactionItemDoc, index: number, book: CategoryBook) {
  return {
    line_no: r.lineNo,
    name: r.name,
    qty: r.qty,
    unit_price: r.unitPrice,
    gross_amount: r.grossAmount ?? null,
    discount: r.discount ?? null,
    discount_label: r.discountLabel ?? null,
    amount: r.amount,
    flag: r.flag,
    category_id: r.categoryId ?? null,
    category: book.nameOf(r.categoryId),
    // หมวดหลักที่ dashboard ใช้จัดกลุ่ม (หมวดย่อย -> แม่, ยังไม่จัดหมวด -> อื่นๆ)
    category_root: book.rootOf(r.categoryId).name,
    id: index + 1,
  };
}

export function insuranceOut(i: InsuranceDoc | null | undefined) {
  if (!i) return null;
  return {
    insurer: i.insurer,
    policy_number: i.policyNumber,
    policy_type: i.policyType,
    policy_type_name: i.policyType ? policyTypeOf(i.policyType).name : null,
    insured_name: i.insuredName,
    coverage_start: i.coverageStart,
    coverage_end: i.coverageEnd,
    premium: i.premium,
  };
}

export function transactionOut(r: TransactionDoc, book: CategoryBook) {
  return {
    id: r._id,
    receipt_id: r.receiptId,
    direction: r.direction,
    merchant_name: r.merchantName,
    merchant_type: r.merchantType ?? null,
    /** ชื่อประเภทร้านไว้แสดงผล — ยังไม่ได้จัดจะได้ "ร้านอื่นๆ" */
    merchant_type_name: merchantTypeOf(r.merchantType).name,
    branch: r.branch,
    merchant_tax_id: r.merchantTaxId,
    doc_number: r.docNumber,
    // สองนาฬิกาที่ห้ามสลับกัน — ดู db/models.ts
    purchased_at: r.purchasedAt,
    purchased_time: r.purchasedTime,
    currency: r.currency,
    subtotal: r.subtotal,
    discount: r.discount,
    bill_discounts: (r.billDiscounts ?? []).map((b) => ({
      label: b.label,
      kind: b.kind,
      amount: b.amount,
      points_used: b.pointsUsed,
    })),
    service_charge: r.serviceCharge,
    vat_rate: r.vatRate,
    vat_amount: r.vatAmount,
    total: r.total,
    category_id: r.categoryId ?? null,
    category: book.nameOf(r.categoryId),
    category_root: book.rootOf(r.categoryId).name,
    insurance: insuranceOut(r.insurance),
    payment_method: r.paymentMethod,
    payment_channel: r.paymentChannel,
    note: r.note,
    verified_by_user: r.verifiedByUser,
    // ใบเก่าที่บันทึกไว้ก่อนมีฟิลด์นี้ ใช้เวลาที่สร้างเรคอร์ดแทน
    uploaded_at: iso(r.uploadedAt ?? r.createdAt),
    created_at: iso(r.createdAt),
    items: (r.items ?? []).map((it, i) => itemOut(it, i, book)),
  };
}
