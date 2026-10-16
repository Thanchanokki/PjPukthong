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

/**
 * ส่วนลดท้ายบิลที่ถูกนับซ้ำกับส่วนลดรายสินค้า -> ทิ้ง
 *
 * ใบอย่าง H&M พิมพ์ส่วนลดใต้สินค้า แล้วพิมพ์ "Customer Discount" ท้ายใบเป็นยอดสรุปของส่วนลดเดิม
 * AI มักใส่ทั้งสองที่ ตัดสินด้วยยอดรวมบนใบ (ตัวเลขที่เชื่อถือได้ที่สุด):
 * ถ้าราคาสุทธิของรายการรวมกันเท่ายอดรวมพอดีอยู่แล้ว แต่หักส่วนลดท้ายบิลแล้วไม่เท่า = นับซ้ำ
 * และส่วนลดท้ายบิลต้องไม่เกินผลรวมส่วนลดรายสินค้า (ไม่งั้นอาจเป็นส่วนลดจริงอีกก้อน)
 */
function dropDoubleCountedDiscount(d: ReceiptDraft) {
  const bill = dec(d.discount);
  const total = dec(d.total);
  if (!bill || bill.isZero() || total === null || d.line_items.length === 0) return;
  const amounts = d.line_items.map((i) => i.amount).filter((a) => a !== null);
  const itemDisc = sum(d.line_items.map((i) => i.discount));
  const base = sum(amounts)
    .plus(or0(d.service_charge))
    .plus(d.vat_included ? ZERO : or0(d.vat_amount));
  const near = (a: Decimal, b: Decimal) => a.minus(b).abs().lte(TOLERANCE);
  if (itemDisc.gte(bill.abs()) && near(base, total) && !near(base.minus(bill.abs()), total)) {
    d.discount = null;
    // ยอดรวมบนใบเท่าผลรวมราคาสุทธิอยู่แล้ว ส่วนลดท้ายบิลทุกก้อนจึงเป็นยอดสรุปของส่วนลดรายสินค้า
    d.bill_discounts = [];
    // subtotal ที่ AI คิดมาจากส่วนลดก้อนเดียวกันก็ผิดตาม — ล้างทิ้งให้ผู้ใช้เห็นค่าว่างดีกว่าค่าผิด
    const sub = dec(d.subtotal);
    if (sub !== null && near(sub.minus(bill.abs()), total)) d.subtotal = null;
  }
}

/** ห่างกันเกินเท่านี้ถือว่าน่าสงสัย — ถ่ายใบเก่าเก็บตกยังปกติ แต่ข้ามปีมักคืออ่านปีผิด */
const DATE_GAP_WARN_DAYS = 120;

export function enrich(d: ReceiptDraft, uploadedAt: Date = new Date()): ReceiptDraft {
  const warnings = [...d.warnings];
  dropDoubleCountedDiscount(d);

  /**
   * วันที่บนใบห่างจากวันที่สแกนมากผิดปกติ = สัญญาณว่า AI อ่านปีผิด
   *
   * จับตรงนี้สำคัญมาก เพราะยอดจะไปโผล่ผิดเดือนแล้วดูเหมือนข้อมูลหาย โดยที่ทุกอย่าง
   * "ดูถูกต้อง" ทั้งใบ — ผู้ใช้จะไม่มีทางเอะใจถ้าไม่มีใครบอก
   */
  if (d.issued_at) {
    const issued = new Date(`${d.issued_at}T00:00:00Z`);
    const days = (uploadedAt.getTime() - issued.getTime()) / 86_400_000;
    if (days > DATE_GAP_WARN_DAYS) {
      warnings.push(
        `วันที่บนใบ (${d.issued_at}) เก่ากว่าวันที่สแกน ${Math.round(days)} วัน — ` +
          `ตรวจว่าอ่านปีถูกไหม ไม่งั้นยอดจะไปอยู่ผิดเดือน`,
      );
    } else if (days < -1) {
      warnings.push(`วันที่บนใบ (${d.issued_at}) เป็นวันในอนาคต — ตรวจสอบอีกครั้ง`);
    }
  }

  if (d.merchant_tax_id && d.merchant_tax_id.replace(/\D/g, "").length !== 13) {
    warnings.push("เลขผู้เสียภาษีไม่ครบ 13 หลัก — ตรวจสอบอีกครั้ง");
  }

  if (d.total === null) warnings.push("อ่านยอดรวมไม่ได้ กรุณากรอกเอง");
  if (d.issued_at === null) warnings.push("อ่านวันที่ไม่ได้ กรุณากรอกเอง");

  /**
   * ผลรวมราคาสุทธิของรายการ (หลังหักส่วนลดรายชิ้นแล้ว) − ส่วนลดท้ายบิล + ค่าบริการ
   * (+ VAT ถ้าแยกนอกราคา) ต้องเท่ายอดรวมบนใบ — ไม่ตรง = อ่านรายการหรือส่วนลดตกหล่น
   */
  const amounts = d.line_items.map((i) => i.amount).filter((a) => a !== null);
  const total0 = dec(d.total);
  if (amounts.length > 0 && total0 !== null) {
    const net = sum(amounts);
    const expected = net
      .minus(or0(d.discount))
      .plus(or0(d.service_charge))
      .plus(d.vat_included ? ZERO : or0(d.vat_amount));
    if (expected.minus(total0).abs().gt(TOLERANCE)) {
      warnings.push(
        `ผลรวมรายการหลังหักส่วนลด ${expected.toFixed(2)} ≠ ยอดรวม ${total0.toFixed(2)} — ตรวจรายการหรือส่วนลดที่อาจตกหล่น`,
      );
    }
  }

  // ราคาเต็ม − ส่วนลด ต้องเท่าราคาสุทธิในทุกรายการ (normalizeItemPrice คำนวณให้แล้ว
  // จึงไม่ควรเกิด แต่กันไว้ถ้าส่วนลดมากกว่าราคาเต็ม = อ่านส่วนลดผิดบรรทัด)
  const overDiscount = d.line_items.filter((i) => (dec(i.amount) ?? ZERO).isNegative() && dec(i.gross_amount) !== null);
  if (overDiscount.length > 0) {
    warnings.push(`ส่วนลดมากกว่าราคาสินค้า: ${overDiscount.map((i) => i.name ?? "(ไม่มีชื่อ)").join(", ")}`);
  }

  // ใบที่มีรายการสินค้าตรวจจากผลรวมรายการด้านบนแล้ว — ตรวจจาก subtotal เฉพาะใบที่ไม่มีรายการ
  // (subtotal มักไม่ได้พิมพ์บนใบ AI ต้องเดาความหมายเอง ถ้าตรวจซ้ำจะเตือนผิดบ่อย)
  const subtotal = dec(d.subtotal);
  const total = dec(d.total);
  if (amounts.length === 0 && subtotal !== null && total !== null) {
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
