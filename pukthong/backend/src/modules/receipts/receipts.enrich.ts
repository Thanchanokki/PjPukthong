/**
 * ตรวจสอบไขว้ผลจาก AI แล้วเติม warnings
 *
 * ทุกอย่างในไฟล์นี้ "เตือน" เท่านั้น ห้าม throw เด็ดขาด — ใบเสร็จที่อ่านได้ไม่ครบ
 * ต้องยังส่งถึงมือผู้ใช้ให้กรอกเพิ่มเองได้
 */
import { Decimal, ZERO, dec, sum } from "../../shared/money.js";
import type { ReceiptDraft } from "./receipts.schema.js";

const TOLERANCE = new Decimal(1); // คลาดเคลื่อนได้ 1 บาท (ปัดเศษบนใบเสร็จ)

const or0 = (v: string | null): Decimal => dec(v) ?? ZERO;

export function enrich(d: ReceiptDraft): ReceiptDraft {
  const warnings = [...d.warnings];

  if (d.merchant_tax_id && d.merchant_tax_id.replace(/\D/g, "").length !== 13) {
    warnings.push("เลขผู้เสียภาษีไม่ครบ 13 หลัก — ตรวจสอบอีกครั้ง");
  }

  if (d.total === null) warnings.push("อ่านยอดรวมไม่ได้ กรุณากรอกเอง");
  if (d.issued_at === null) warnings.push("อ่านวันที่ไม่ได้ กรุณากรอกเอง");

  // ผลรวมรายการควรเทียบกับยอดก่อน VAT ถ้ามี ไม่ใช่ยอดรวมสุทธิ
  // (ไม่งั้นใบที่มีส่วนลด/ค่าบริการ/VAT แยก จะขึ้นเตือนผิดทุกใบ)
  const amounts = d.line_items.map((i) => i.amount).filter((a) => a !== null);
  if (amounts.length > 0) {
    const s = sum(amounts);
    const base = dec(d.subtotal) ?? dec(d.total);
    if (base !== null && s.minus(base).abs().gt(TOLERANCE)) {
      const label = d.subtotal !== null ? "ยอดก่อน VAT" : "ยอดรวม";
      warnings.push(`ผลรวมรายการ ${s.toString()} ≠ ${label} ${base.toString()}`);
    }
  }

  const subtotal = dec(d.subtotal);
  const total = dec(d.total);
  if (subtotal !== null && total !== null) {
    const calc = subtotal
      .minus(or0(d.discount))
      .plus(or0(d.service_charge))
      .plus(d.vat_included ? ZERO : or0(d.vat_amount));
    if (calc.minus(total).abs().gt(TOLERANCE)) {
      warnings.push(`ยอดที่คำนวณได้ ${calc.toString()} ≠ ยอดรวมบนใบ ${total.toString()}`);
    }
  }

  if (d.line_items.some((i) => i.flag) && d.vat_included) {
    warnings.push("มีรายการติดธงกำกับ — ตรวจสอบการคิด VAT ก่อนใช้ทางบัญชี");
  }

  if (!d.line_items_complete) {
    warnings.push("AI อ่านรายการสินค้าได้ไม่ครบ ตรวจสอบก่อนบันทึก");
  }

  if (d.unreadable_regions.length > 0) {
    warnings.push("ส่วนที่อ่านไม่ออก: " + d.unreadable_regions.slice(0, 3).join(", "));
  }

  const low = Object.entries(d.confidence)
    .filter(([, v]) => v < 0.7)
    .map(([k]) => k)
    .sort();
  if (low.length > 0) {
    warnings.push("ฟิลด์ที่ AI ไม่มั่นใจ: " + low.join(", "));
  }

  // ไม่เทียบจำนวนบรรทัดกับ item_count_printed แบบตายตัว
  // เพราะของแถมราคา 0.00 บาท มักไม่ถูกนับเป็นชิ้นบนใบเสร็จ — ใช้ผลรวมเงินแทน

  // กันเตือนซ้ำโดยคงลำดับเดิม
  d.warnings = [...new Set(warnings)];
  return d;
}
