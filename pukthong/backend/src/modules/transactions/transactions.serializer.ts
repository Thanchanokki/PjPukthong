/**
 * แปลง TransactionDoc จาก MongoDB (camelCase, _id) เป็น JSON ที่ frontend รออยู่
 * (snake_case, id) ลำดับฟิลด์และชนิดข้อมูลต้องตรงกับ frontend/src/api.ts ทุกตัว
 */
import type { TransactionDoc, TransactionItemDoc } from "../../db/models.js";

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/**
 * เดิมรายการย่อยเป็นแถวในตารางจึงมี id ของตัวเอง ตอนนี้ฝังอยู่ใน transaction แล้ว
 * แต่ frontend ยังประกาศ type ว่ามี id: number — ใช้ลำดับในอาเรย์แทน
 */
export function itemOut(r: TransactionItemDoc, index: number) {
  return {
    line_no: r.lineNo,
    name: r.name,
    qty: r.qty,
    unit_price: r.unitPrice,
    amount: r.amount,
    flag: r.flag,
    id: index + 1,
  };
}

export function transactionOut(r: TransactionDoc) {
  return {
    id: r._id,
    receipt_id: r.receiptId,
    direction: r.direction,
    merchant_name: r.merchantName,
    branch: r.branch,
    merchant_tax_id: r.merchantTaxId,
    doc_number: r.docNumber,
    occurred_on: r.occurredOn,
    occurred_at_time: r.occurredAtTime,
    currency: r.currency,
    subtotal: r.subtotal,
    discount: r.discount,
    service_charge: r.serviceCharge,
    vat_rate: r.vatRate,
    vat_amount: r.vatAmount,
    total: r.total,
    category: r.category,
    payment_method: r.paymentMethod,
    payment_channel: r.paymentChannel,
    note: r.note,
    verified_by_user: r.verifiedByUser,
    created_at: iso(r.createdAt),
    items: (r.items ?? []).map(itemOut),
  };
}
