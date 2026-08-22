/**
 * คะแนนความน่าเชื่อถือของผลสแกน (0–100) พร้อมเหตุผลว่าคิดมาจากอะไร
 *
 * ⚠️ นี่ไม่ใช่ "ความแม่นยำ" — ความแม่นยำต้องมีเฉลยว่าบนใบเขียนอะไรจริงๆ มาเทียบ
 * ซึ่งเราไม่มี สิ่งที่วัดได้คือ "หลักฐานที่ตรวจสอบได้ว่าผลนี้น่าเชื่อแค่ไหน"
 *
 * หลักฐานที่ดีที่สุดมาจากสถาปัตยกรรมที่ให้ OCR ทำงานคู่กับ AI: เรามีทั้งข้อความดิบ
 * ที่ Cloud Vision อ่านจากพิกเซล และผลตีความเป็นฟิลด์ของ AI จึงสอบทานกันได้ว่า
 * ตัวเลขที่ AI ตอบมา "มีอยู่บนใบจริง" หรือ "แต่งขึ้นมาเอง" — เป็นข้อเท็จจริง
 * ที่พิสูจน์ได้ ไม่ใช่ความเห็นของโมเดลที่ประเมินตัวเอง
 *
 * ทุกเช็คมีสามสถานะ: ผ่าน / ไม่ผ่าน / ตรวจไม่ได้
 * ตัวที่ "ตรวจไม่ได้" ถูกตัดออกจากการคิดคะแนนแล้วเกลี่ยน้ำหนักใหม่ ไม่ใช่นับเป็นศูนย์
 * เพราะใบที่ไม่มี VAT ไม่ควรถูกหักคะแนนจากการที่ไม่มี VAT ให้ตรวจ
 */
import { Decimal, ZERO, dec, sum } from "../../shared/money.js";
import type { ReceiptDraft } from "./receipts.schema.js";

/** คลาดเคลื่อนได้ 1 บาท เท่ากับที่ receipts.enrich ใช้ (ปัดเศษบนใบเสร็จ) */
const TOLERANCE = new Decimal(1);

export type CheckStatus = "pass" | "fail" | "unknown";

export interface Check {
  key: string;
  /** ข้อความไทยที่แสดงให้ผู้ใช้อ่านตรงๆ */
  label: string;
  status: CheckStatus;
  /** น้ำหนักก่อนเกลี่ย — ตัวที่ตรวจไม่ได้จะถูกตัดออกแล้วเกลี่ยให้ตัวที่เหลือ */
  weight: number;
  /** รายละเอียดว่าทำไมได้สถานะนี้ */
  detail: string;
}

export interface ScanConfidence {
  /** 0–100 (ปัดเป็นจำนวนเต็ม) — null เมื่อไม่มีอะไรให้ตรวจเลย */
  score: number | null;
  /** high | medium | low — ไว้เลือกสีและข้อความ ไม่ต้องให้ frontend ตีเส้นเอง */
  level: "high" | "medium" | "low" | "unknown";
  checks: Check[];
}

// ------------------------------------------------------------ ตัวช่วยเทียบข้อความ

/**
 * ดึงตัวเลขทุกตัวที่ปรากฏในข้อความ OCR ออกมาเป็นชุดรูปแบบมาตรฐาน
 *
 * ต้อง normalize เพราะบนใบพิมพ์ '1,234.50' แต่ AI ตอบ '1234.5' — ถ้าเทียบสตริงตรงๆ
 * จะไม่ตรงกันทั้งที่เป็นเลขเดียวกัน จึงแปลงทั้งสองฝั่งเป็น Decimal แล้วเทียบค่า
 */
function numbersIn(text: string): Set<string> {
  const found = new Set<string>();
  for (const raw of text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []) {
    try {
      found.add(new Decimal(raw.replace(/,/g, "")).toString());
    } catch {
      /* ไม่ใช่ตัวเลขที่ Decimal รับได้ — ข้ามไป */
    }
  }
  return found;
}

/** ค่าเงินนี้ปรากฏอยู่ในข้อความ OCR จริงไหม */
function amountIsGrounded(value: string | null, pool: Set<string>): boolean {
  const d = dec(value);
  if (d === null) return false;
  // เทียบหลายรูป: 90, 90.00, 90.0 — บนใบพิมพ์แบบไหนก็ได้
  return (
    pool.has(d.toString()) || pool.has(d.toFixed(2)) || pool.has(d.toFixed(0))
  );
}

/** ตัดช่องว่างและตัวพิมพ์เล็กใหญ่ทิ้งก่อนเทียบ — OCR เว้นวรรคไม่เหมือนกันเสมอ */
const squash = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/**
 * วันที่นี้ปรากฏบนใบจริงไหม — ลองทุกรูปแบบที่ใบเสร็จไทยใช้กัน
 *
 * รวมปี พ.ศ. ด้วย เพราะ AI แปลงเป็น ค.ศ. ให้แล้วตามที่ prompt สั่ง แต่บนใบยังเป็น
 * พ.ศ. อยู่ — ถ้าไม่ลองรูปนี้ ใบไทยเกือบทุกใบจะถูกตัดสินว่า "วันที่ไม่มีบนใบ"
 */
function dateIsGrounded(iso: string, ocr: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const [, y, mo, d] = m;
  const be = String(Number(y) + 543);
  const dd = String(Number(d));
  const mm = String(Number(mo));
  const flat = squash(ocr);

  const forms = [
    `${y}-${mo}-${d}`, `${y}/${mo}/${d}`,
    `${d}/${mo}/${y}`, `${d}-${mo}-${y}`, `${d}.${mo}.${y}`,
    `${d}/${mo}/${be}`, `${d}-${mo}-${be}`, `${d}.${mo}.${be}`,
    `${be}-${mo}-${d}`,
    `${dd}/${mm}/${y}`, `${dd}/${mm}/${be}`,
    `${d}/${mo}/${y.slice(2)}`, `${d}/${mo}/${be.slice(2)}`,
  ];
  return forms.some((f) => flat.includes(squash(f)));
}

// ------------------------------------------------------------ ตัวคิดคะแนน

export function scanConfidence(
  draft: ReceiptDraft,
  ocrText: string | null,
  ocrQuality: number | null,
): ScanConfidence {
  const checks: Check[] = [];
  const pool = ocrText ? numbersIn(ocrText) : null;

  // ── 1. ยอดรวมมีอยู่บนใบจริงไหม (หลักฐานแข็งที่สุด — ตัวเลขนี้คือหัวใจของทั้งใบ)
  checks.push(
    pool === null
      ? {
          key: "total_grounded",
          label: "ยอดรวมตรงกับตัวเลขบนใบ",
          status: "unknown",
          weight: 30,
          detail: "ไม่มีข้อความ OCR ให้สอบทาน (OCR ปิดอยู่หรือเรียกไม่สำเร็จ)",
        }
      : draft.total === null
        ? {
            key: "total_grounded",
            label: "ยอดรวมตรงกับตัวเลขบนใบ",
            status: "fail",
            weight: 30,
            detail: "อ่านยอดรวมไม่ได้เลย",
          }
        : amountIsGrounded(draft.total, pool)
          ? {
              key: "total_grounded",
              label: "ยอดรวมตรงกับตัวเลขบนใบ",
              status: "pass",
              weight: 30,
              detail: `พบเลข ${draft.total} ในข้อความที่ OCR อ่านได้จากรูปโดยตรง`,
            }
          : {
              key: "total_grounded",
              label: "ยอดรวมตรงกับตัวเลขบนใบ",
              status: "fail",
              weight: 30,
              detail: `ไม่พบเลข ${draft.total} ในข้อความ OCR — AI อาจคำนวณเองหรืออ่านผิด`,
            },
  );

  // ── 2. ยอดของรายการย่อยมีอยู่บนใบกี่บรรทัด
  const withAmount = draft.line_items.filter((i) => dec(i.amount) !== null);
  if (pool === null || withAmount.length === 0) {
    checks.push({
      key: "items_grounded",
      label: "ยอดรายการย่อยตรงกับตัวเลขบนใบ",
      status: "unknown",
      weight: 20,
      detail:
        withAmount.length === 0
          ? "ใบนี้ไม่มีรายการย่อยที่มียอด จึงไม่มีอะไรให้สอบทาน"
          : "ไม่มีข้อความ OCR ให้สอบทาน",
    });
  } else {
    const hit = withAmount.filter((i) => amountIsGrounded(i.amount, pool)).length;
    const ratio = hit / withAmount.length;
    checks.push({
      key: "items_grounded",
      label: "ยอดรายการย่อยตรงกับตัวเลขบนใบ",
      // ยอมให้พลาดได้บ้าง เพราะบางใบพิมพ์ราคารวมส่วนลดไว้คนละบรรทัด
      status: ratio >= 0.8 ? "pass" : "fail",
      weight: 20,
      detail: `พบ ${hit} จาก ${withAmount.length} บรรทัดในข้อความ OCR`,
    });
  }

  // ── 3. เลขบนใบบวกกันแล้วลงตัวไหม (ตรวจได้ด้วยเลขคณิตล้วน ไม่ต้องเชื่อใคร)
  const itemsSum = sum(draft.line_items.map((i) => i.amount));
  const base = dec(draft.subtotal) ?? itemsSum;
  const expected = base
    .minus(dec(draft.discount) ?? ZERO)
    .plus(dec(draft.service_charge) ?? ZERO)
    .plus(draft.vat_included ? ZERO : (dec(draft.vat_amount) ?? ZERO));
  const total = dec(draft.total);

  if (total === null || (itemsSum.isZero() && draft.subtotal === null)) {
    checks.push({
      key: "arithmetic",
      label: "ตัวเลขบนใบบวกกันลงตัว",
      status: "unknown",
      weight: 25,
      detail: "ไม่มียอดย่อยหรือยอดรวมมากพอให้ตรวจสอบการบวก",
    });
  } else {
    const diff = expected.minus(total).abs();
    checks.push({
      key: "arithmetic",
      label: "ตัวเลขบนใบบวกกันลงตัว",
      status: diff.lte(TOLERANCE) ? "pass" : "fail",
      weight: 25,
      detail: diff.lte(TOLERANCE)
        ? `ยอดที่คำนวณได้ ${expected.toFixed(2)} ตรงกับยอดรวม ${total.toFixed(2)}`
        : `ยอดที่คำนวณได้ ${expected.toFixed(2)} ต่างจากยอดรวม ${total.toFixed(2)} อยู่ ${diff.toFixed(2)} บาท`,
    });
  }

  // ── 4. วันที่มีอยู่บนใบจริงไหม (กันเคสอ่านปีผิดที่ทำให้ยอดไปโผล่ผิดเดือน)
  checks.push(
    !ocrText
      ? {
          key: "date_grounded",
          label: "วันที่ตรงกับที่พิมพ์บนใบ",
          status: "unknown",
          weight: 15,
          detail: "ไม่มีข้อความ OCR ให้สอบทาน",
        }
      : draft.issued_at === null
        ? {
            key: "date_grounded",
            label: "วันที่ตรงกับที่พิมพ์บนใบ",
            status: "fail",
            weight: 15,
            detail: "อ่านวันที่ไม่ได้เลย",
          }
        : dateIsGrounded(draft.issued_at, ocrText)
          ? {
              key: "date_grounded",
              label: "วันที่ตรงกับที่พิมพ์บนใบ",
              status: "pass",
              weight: 15,
              detail: `พบวันที่ ${draft.issued_at} บนใบ (นับรูปแบบ พ.ศ. ด้วย)`,
            }
          : {
              key: "date_grounded",
              label: "วันที่ตรงกับที่พิมพ์บนใบ",
              status: "fail",
              weight: 15,
              detail: `หาวันที่ ${draft.issued_at} ในข้อความ OCR ไม่เจอ — ตรวจปีให้ดี`,
            },
  );

  // ── 5. Cloud Vision อ่านตัวอักษรได้ชัดแค่ไหน (ความมั่นใจระดับพิกเซล)
  checks.push(
    ocrQuality === null
      ? {
          key: "ocr_quality",
          label: "ความคมชัดของตัวอักษรที่ OCR อ่านได้",
          status: "unknown",
          weight: 10,
          detail: "ไม่ได้ทำ OCR หรือทำแล้วไม่ได้คะแนนกลับมา",
        }
      : {
          key: "ocr_quality",
          label: "ความคมชัดของตัวอักษรที่ OCR อ่านได้",
          status: ocrQuality >= 0.85 ? "pass" : "fail",
          weight: 10,
          detail: `Cloud Vision มั่นใจเฉลี่ย ${(ocrQuality * 100).toFixed(0)}% ถ่วงน้ำหนักตามจำนวนตัวอักษร`,
        },
  );

  /**
   * เกลี่ยน้ำหนักเฉพาะตัวที่ตรวจได้
   *
   * ตัวที่ "ตรวจไม่ได้" ต้องไม่ถูกนับเป็นศูนย์ ไม่งั้นใบที่ไม่มี VAT หรือไม่มีรายการย่อย
   * จะได้คะแนนต่ำทั้งที่ทุกอย่างที่ตรวจได้ผ่านหมด — นั่นคือการลงโทษความไม่รู้
   */
  const usable = checks.filter((c) => c.status !== "unknown");
  const totalWeight = usable.reduce((n, c) => n + c.weight, 0);
  if (totalWeight === 0) return { score: null, level: "unknown", checks };

  const earned = usable
    .filter((c) => c.status === "pass")
    .reduce((n, c) => n + c.weight, 0);
  const score = Math.round((earned / totalWeight) * 100);

  return {
    score,
    level: score >= 85 ? "high" : score >= 60 ? "medium" : "low",
    checks,
  };
}
