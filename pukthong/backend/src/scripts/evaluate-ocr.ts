/**
 * ประเมินความแม่นยำของการอ่านใบเสร็จ (Typhoon OCR -> AI) เทียบกับเฉลยที่คนพิมพ์เอง
 * แล้วออกตารางสรุปเป็น CSV สำหรับใส่รายงาน
 *
 *   npm run evaluate                         # ขนาดเดียว (2400px = ค่าที่แอปใช้จริง) 1 รอบ
 *   npm run evaluate -- --sizes=800,1200,1600,2000,2400 --runs=2
 *   npm run evaluate -- --limit=3            # ลองแค่ 3 ใบแรกก่อน (เช็คว่าเฉลยกรอกถูก)
 *   npm run evaluate -- --sizes=... --resume # รันต่อเฉพาะครั้งที่ยังไม่ผ่าน (API ล้มกลางทาง)
 *   npm run evaluate -- --sizes=1200 --resume --table-size=1200   # ทำตารางจากผลที่มี ไม่เรียก API
 *   npm run evaluate -- --check              # ตรวจรูปแบบเฉลยอย่างเดียว ไม่เรียก API
 *   npm run evaluate -- --dir=evaluation-slides   # ใช้ชุดทดสอบอื่น (โครงสร้างโฟลเดอร์เหมือน evaluation/)
 *
 * อินพุต (อยู่ใน evaluation/ — ห้าม commit รูปและเฉลยจริง ดู .gitignore):
 *   images/<file>                รูปใบเสร็จต้นฉบับ
 *   ground-truth.csv             เฉลย 1 แถว/ใบ (รูปแบบเดียวกับ ground-truth.example.csv)
 *   truth-text/<file ไม่มีนามสกุล>.txt   (ไม่บังคับ) ข้อความทั้งใบ ใช้คิด CER
 *
 * คอลัมน์ของเฉลย:
 *   items            ราคาสุทธิของสินค้าทีละรายการ คั่นด้วย | — รายการที่มีส่วนลดเขียน "ราคาเต็ม-ส่วนลด"
 *                    เช่น 699.00|129.00-26.54|249.00-51.23 (= สุทธิ 699.00, 102.46, 197.77)
 *                    บรรทัดส่วนลด/แต้มไม่ใช่สินค้า ห้ามใส่เป็นรายการ
 *   bill_discounts   ส่วนลดท้ายบิล คั่นด้วย | ใส่ชนิดนำหน้าได้ เช่น 5.00 หรือ points:3.00|member:10.00
 *                    (ชนิด: discount, member, coupon, points) — เว้นว่าง = ใบนี้ไม่มีส่วนลดท้ายบิล
 *   item_categories  id หมวดของสินค้าแต่ละรายการ เรียงตาม items เช่น food|drinks|personal
 *                    (id ดูใน shared/categories.ts) — เว้นว่าง = ไม่คิดคะแนนหมวดของใบนี้
 *
 * เอาต์พุต evaluation/results/:
 *   table1-accuracy.csv          ความแม่นยำรายฟิลด์ (ที่ขนาดภาพที่แอปใช้จริง)
 *   table2-by-merchant-type.csv  แยกตามประเภทร้าน
 *   table2-by-condition.csv      แยกตามสภาพภาพ
 *   table3-image-size.csv        ขนาดภาพ vs ความถูกต้อง (ย่อรูปต้นฉบับเหลือด้านยาว N px
 *                                แล้วให้ผ่านระบบตามปกติทั้ง OCR และ AI — เหมือนผู้ใช้ถ่ายมาที่ความละเอียดนั้น)
 *   table4-error-causes.csv      จำแนกสาเหตุของข้อผิดพลาด (ชั้น OCR / ชั้นแยกฟิลด์)
 *   table5-item-categories.csv   ชั้นจัดหมวดหมู่: accuracy, macro-F1, amount-weighted + รายหมวด
 *   table5-confusion-matrix.csv  แถว = หมวดในเฉลย, คอลัมน์ = หมวดที่ระบบจัด
 *   table6-receipt-score.csv     คะแนนรวมต่อใบ: Exact Match และ Weighted Sum (+ sensitivity)
 *   raw/per-receipt.csv          ผลทุกใบทุกขนาด (มีข้อมูลจากใบจริง — ไม่ขึ้น git)
 *   raw/ocr/*.txt                ข้อความ OCR ดิบ ไว้ตรวจทานสาเหตุด้วยตา
 *
 * กติกาการนับ (ควรเขียนไว้ในรายงาน):
 *   - ระบบที่ประเมิน = ขั้นตอนเดียวกับปุ่ม "ให้ AI อ่าน" ในแอป: parseDraft -> enrich -> จับคู่หมวด
 *     -> หมวดเริ่มต้นตามประเภทร้าน (ร้านอาหาร = อาหารทุกรายการ ฯลฯ)
 *   - ยอดเงินถูก = ตรงกับเฉลยที่ทศนิยม 2 ตำแหน่ง (ไม่มีช่วงคลาดเคลื่อน)
 *   - VAT: เฉลย 0.00 กับ AI ตอบว่าไม่มี (null) ถือว่าตรงกัน (ใบที่ไม่มี VAT)
 *   - วันที่ถูก = ตรงทุกหลัก YYYY-MM-DD (หลังแปลง พ.ศ. เป็น ค.ศ.) — เฉลยเว้นว่าง = ไม่คิดคะแนนใบนั้น
 *   - ชื่อร้านถูก = หลังตัดช่องว่าง/เครื่องหมาย ชื่อหนึ่งอยู่ในอีกชื่อ หรือคล้ายกัน ≥ 80%
 *   - รายการสินค้า = จับคู่ "ราคาสุทธิ" แบบ multiset แล้วคิด precision / recall / F1
 *     (จับคู่ที่ราคาเต็มและส่วนลดตรงด้วยก่อน แล้วค่อยจับคู่ที่สุทธิตรงอย่างเดียว)
 *   - ส่วนลดรายชิ้น = เฉพาะรายการที่มีส่วนลด: ถูกเมื่อจับคู่ได้และยอดส่วนลดตรงกัน (P/R/F1)
 *   - ส่วนลดท้ายบิลถูก = ผลรวมส่วนลดท้ายบิลตรงกับเฉลย (ใบไม่มีส่วนลดทั้งคู่ = ถูก)
 *   - หมวดสินค้า (ชั้น 3) = คิดเฉพาะรายการที่จับคู่ได้ในชั้น 2 (ไม่ลงโทษซ้ำ) ยกเว้นคะแนนต่อใบ S3
 *     ที่คิดทุกรายการในเฉลย (รายการที่ระบบอ่านไม่ได้ = จัดหมวดผิด เพราะเงินก้อนนั้นไม่เข้างบ)
 *   - คะแนนต่อใบ: S2 = 0.40 ยอดรวม + 0.20 วันที่ + 0.15 ชื่อร้าน + 0.10 VAT + 0.15 F1 รายการ
 *     (ฟิลด์ที่ไม่คิดคะแนนตัดออกแล้วปรับน้ำหนักที่เหลือให้รวมเป็น 1), S3 = สัดส่วนเงินที่จัดหมวดถูก,
 *     คะแนนรวม = 0.625 S2 + 0.375 S3 (= น้ำหนัก 0.5 : 0.3 ของชั้น 2 : 3 เมื่อตัดชั้น OCR ออก)
 *     Exact Match = ยอดรวม วันที่ ชื่อร้าน VAT ส่วนลด รายการ และหมวด ถูกหมดทั้งใบ
 *   - CER = edit distance / ความยาวเฉลย (ตัดช่องว่าง แท็ก HTML และสัญลักษณ์ markdown ออกก่อน)
 *   - ใบที่เรียก API ไม่สำเร็จ (ล่ม/โดนจำกัด) ไม่ถูกนับเป็นผิด แต่แจ้งจำนวนแยกไว้
 *   - ทุกครั้งที่รันจะให้คะแนนผลเก่าใหม่ด้วยเฉลยปัจจุบัน — แก้เฉลยแล้วไม่ต้องเรียก API ซ้ำ
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";

import { amountIsGrounded, dateIsGrounded, numbersIn } from "../modules/receipts/confidence.js";
import { extractReceipt } from "../modules/receipts/ai.provider.js";
import { prepareForOcr, requestOcr } from "../modules/receipts/ocr.provider.js";
import { enrich } from "../modules/receipts/receipts.enrich.js";
import { parseDraft } from "../modules/receipts/receipts.schema.js";
import { unsupportedReason } from "../modules/receipts/receipts.support.js";
import { SYSTEM_CATEGORIES, matchCategory } from "../shared/categories.js";
import { normalizeKind } from "../shared/discounts.js";
import { MERCHANT_TYPES, categoryForItem, matchMerchantType, merchantTypeOf } from "../shared/merchant-types.js";
import { Decimal } from "../shared/money.js";

const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];

/** --dir=evaluation-slides ใช้ชุดทดสอบอื่น (รูป เฉลย และผลแยกโฟลเดอร์กัน) ค่าเริ่มต้น = evaluation */
const ROOT = path.resolve(arg("dir") ?? "evaluation");
const ROOT_NAME = path.relative(process.cwd(), ROOT);
const OUT = path.join(ROOT, "results");
const RAW = path.join(OUT, "raw");
/** ขนาดที่แอปใช้จริง — ตาราง 1, 2, 4, 5, 6 ใช้ผลที่ขนาดนี้ */
const PRODUCTION_SIZE = 2400;
/**
 * รูปแบบของผลที่เก็บไว้ — ผลรุ่นก่อน (ไม่มี snap) เก็บแค่คะแนน ไม่มีค่าที่ระบบตอบรายชิ้น
 * จึงให้คะแนนใหม่ด้วยเฉลยรูปแบบใหม่ไม่ได้ และมาจากระบบรุ่นก่อนมีส่วนลด/ประเภทร้านชุดใหม่
 */
const RESULT_VERSION = 2;

// ------------------------------------------------------------------ CLI

const sizes = (arg("sizes") ?? String(PRODUCTION_SIZE)).split(",").map(Number);
const runs = Number(arg("runs") ?? 1);
const limit = arg("limit") ? Number(arg("limit")) : Infinity;
const resume = process.argv.includes("--resume");
const checkOnly = process.argv.includes("--check");
/** --only=IMG_1.JPG,IMG_2.JPG ประเมินใหม่เฉพาะใบเหล่านี้ (ทับผลเดิม) ใบอื่นใช้ผลที่เก็บไว้ */
const only = arg("only")?.split(",").map((s) => s.trim()).filter(Boolean) ?? null;
/** API ล้มติดกันเท่านี้ครั้ง = มีปัญหาฝั่งผู้ให้บริการ หยุดก่อนจะเปลืองโควตา (รันต่อด้วย --resume) */
const MAX_CONSECUTIVE_API_ERRORS = 5;

// ------------------------------------------------------------------ CSV

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') (cell += '"'), i++;
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") row.push(cell), (cell = "");
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell), rows.push(row), (row = []), (cell = "");
    } else cell += ch;
  }
  if (cell || row.length) row.push(cell), rows.push(row);
  const [head, ...body] = rows.filter((r) => r.some((c) => c.trim()));
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

/** ใส่ BOM ให้ Excel อ่านภาษาไทยถูก */
function writeCsv(file: string, rows: (string | number | null)[][]) {
  const esc = (v: string | number | null) => {
    const s = v === null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  writeFileSync(file, "﻿" + rows.map((r) => r.map(esc).join(",")).join("\n") + "\n");
}

// ------------------------------------------------------------------ เทียบค่า

const money = (v: string | null | undefined) => {
  if (v === null || v === undefined || v === "") return null;
  try {
    return new Decimal(String(v).replace(/,/g, "")).toFixed(2);
  } catch {
    return null;
  }
};

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

const squash = (s: string) => s.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");

function merchantMatches(truth: string, pred: string | null): boolean {
  if (!pred) return false;
  const a = squash(truth);
  const b = squash(pred);
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length) >= 0.8;
}

/** ข้อความ OCR เป็น markdown + HTML table — ตัดโครงสร้างออกให้เหลือแต่ตัวอักษรก่อนคิด CER */
const plain = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\\([*_#])/g, "$1")
    .replace(/[*#`]/g, "")
    .replace(/\s+/g, "");

function cer(truthText: string, ocrText: string): number {
  const t = plain(truthText);
  return t.length ? levenshtein(t, plain(ocrText)) / t.length : 0;
}

/**
 * ตัวเลขยาวเท่ากันและต่างกันแค่ 1 หลัก (ตัวเลขยาว 6 หลักขึ้นไปยอม 2) = อ่านตัวเลขสับสน
 * เช่น 699 -> 669 — ถ้ายอมเยอะกว่านี้ เลขสั้นที่ต่างกันจริง (99.00 กับ 15.00) จะถูกนับรวมด้วย
 */
function digitConfusion(a: string, b: string): boolean {
  const x = a.replace(/\D/g, "");
  const y = b.replace(/\D/g, "");
  if (x.length !== y.length || x === y) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) diff++;
  return diff <= (x.length >= 6 ? 2 : 1);
}

/** ใบที่ไม่มี VAT: เฉลยใส่ 0.00 ส่วน AI ตอบ null — หมายถึงอย่างเดียวกัน นับว่าถูก */
function scoreVat(truthVat: string | null, predVat: string | null): boolean | null {
  const noVat = (v: string | null) => v === null || v === "0.00";
  if (truthVat === null) return null;
  return noVat(truthVat) ? noVat(predVat) : predVat === truthVat;
}

// ------------------------------------------------------------------ จำแนกสาเหตุ

export const CAUSES = {
  digit: "OCR อ่านตัวเลขผิด (ตัวเลขคล้ายกัน เช่น 6/9, 2/3)",
  ocrMissing: "OCR ตกหล่น (ไม่มีค่าที่ถูกในข้อความ OCR)",
  aiMapping: "AI จับคู่ฟิลด์ผิด (OCR อ่านถูก แต่เลือกค่าผิดช่อง)",
  aiDropped: "AI ข้ามรายการ (มีในข้อความ OCR แต่ไม่ถูกดึงออกมา)",
  aiExtra: "AI ใส่รายการเกิน (เลขมีในใบแต่ไม่ใช่สินค้า)",
  hallucination: "AI แต่งค่าขึ้นเอง (ค่าที่ตอบไม่มีในใบ/ข้อความ OCR)",
  nullValue: "ไม่ได้ค่ากลับมา (อ่านไม่ออก)",
  year: "อ่านปีผิด (วัน/เดือนถูก)",
  swap: "สลับวันกับเดือน",
  discountPlacement: "ส่วนลดรายชิ้นไม่ผูกกับสินค้า (AI ย้ายไปเป็นส่วนลดท้ายบิล)",
} as const;
type Cause = keyof typeof CAUSES;

type ErrorRow = { field: string; cause: Cause; truth: string; pred: string };

/**
 * ค่านี้มีในข้อความ OCR ไหม — เทียบแบบไม่สนเครื่องหมายลบ เพราะตัวดึงตัวเลขจาก OCR
 * ไม่เก็บ "-" (ส่วนลด -26.54 บนใบถูกอ่านเป็น 26.54) ถ้าไม่ทำแบบนี้ส่วนลดทุกบรรทัด
 * จะถูกโทษว่า "OCR ตกหล่น" ทั้งที่ OCR อ่านได้
 */
const inOcr = (v: string, pool: Set<string>) =>
  amountIsGrounded(v.replace(/^-/, ""), pool);

function classifyAmount(truth: string, pred: string | null, ocrPool: Set<string>): Cause {
  if (pred === null) return inOcr(truth, ocrPool) ? "nullValue" : "ocrMissing";
  if (inOcr(truth, ocrPool)) return "aiMapping";
  if (digitConfusion(truth, pred)) return "digit";
  if (!inOcr(pred, ocrPool)) return "hallucination";
  return "ocrMissing";
}

function classifyDate(truth: string, pred: string | null, ocrText: string): Cause {
  if (!pred) return "nullValue";
  const [ty, tm, td] = truth.split("-");
  const [py, pm, pd] = pred.split("-");
  if (tm === pm && td === pd && ty !== py) return "year";
  if (ty === py && tm === pd && td === pm) return "swap";
  return dateIsGrounded(truth, ocrText) ? "aiMapping" : "ocrMissing";
}

// ------------------------------------------------------------------ เรียก API

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * ลองใหม่เมื่อ error น่าจะเป็นแค่ชั่วคราว — error อื่นโยนต่อทันที
 *
 * 401 รวมอยู่ด้วย: ตอนรันยาวๆ KKU เคยตอบ 401 ติดกันกว่า 100 ครั้งทั้งที่ key ใช้ได้
 * (เรียกซ้ำภายหลังผ่านปกติ) จึงรอนานกว่ากรณีอื่นก่อนลองใหม่
 */
/** ข้อความที่ใช้บอกว่าโควตารายวันหมด — main loop เห็นแล้วหยุดทันที */
const DAILY_LIMIT = "โควตารายวันของ API หมดแล้ว";

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const e = err as { status?: number; name?: string; message?: string; cause?: { status?: number; name?: string; message?: string } };
      // KKU ตอบ 401 "This model reached daily limit." — ลองใหม่กี่ครั้งก็ไม่ผ่านจนกว่าจะขึ้นวันใหม่
      if (/daily limit/i.test(`${e.message} ${e.cause?.message}`)) throw new Error(DAILY_LIMIT);
      const status = e.status ?? e.cause?.status ?? 0;
      const timeout = /timeout|timed out/i.test(`${e.name} ${e.cause?.name} ${e.message}`);
      const retryable = status === 401 || status === 429 || status >= 500 || timeout;
      if (attempt >= 4 || !retryable) throw err;
      const wait = (status === 401 ? 15000 : 2000) * 2 ** attempt;
      console.log(`    API ${status || "timeout"} — รอ ${wait / 1000} วินาทีแล้วลองใหม่`);
      await sleep(wait);
    }
  }
}

// ------------------------------------------------------------------ เฉลย

type TruthRow = {
  file: string;
  merchant_type: string;
  condition: string;
  merchant: string;
  date: string;
  total: string;
  vat: string;
  items: string;
  bill_discounts?: string;
  item_categories?: string;
};

type Item = {
  gross: string | null;
  /** ส่วนลดรายชิ้น (บวก) — null = ไม่มี */
  discount: string | null;
  net: string;
  category: string | null;
  /** หมวดที่ AI จัดเอง ก่อนใช้กฎหมวดตามประเภทร้าน — เก็บไว้ให้เปลี่ยนกฎแล้วคิดใหม่ได้โดยไม่เรียก API */
  guess?: string | null;
};
type BillDiscount = { kind: string; amount: string };

type Truth = TruthRow & { itemList: Item[]; billList: BillDiscount[]; hasCategories: boolean };

/** id ของหมวดกลาง (shared/categories.ts) — ในเฉลยใช้ id หรือชื่อไทยก็ได้ */
const categoryId = (v: string) => matchCategory(v, SYSTEM_CATEGORIES);
const categoryName = (id: string | null) =>
  id === null ? "(ไม่ได้จัดหมวด)" : (SYSTEM_CATEGORIES.find((c) => c.id === id)?.name ?? id);

/** แปลงแถวเฉลยเป็นค่าที่ใช้เทียบ — คืนข้อความผิดพลาดถ้ากรอกผิดรูปแบบ */
function parseTruth(row: TruthRow): Truth | string {
  const cells = row.items ? row.items.split("|").map((s) => s.trim()) : [];
  const itemList: Item[] = [];
  for (const cell of cells) {
    const m = /^([\d,]+(?:\.\d+)?)(?:\s*-\s*([\d,]+(?:\.\d+)?))?$/.exec(cell);
    if (!m) {
      return cell.startsWith("-")
        ? `items มีค่าติดลบ "${cell}" — ส่วนลดรายชิ้นให้เขียนติดกับสินค้าเป็น ราคาเต็ม-ส่วนลด, ส่วนลดท้ายบิลย้ายไป bill_discounts`
        : `items อ่านค่า "${cell}" ไม่ได้`;
    }
    const gross = money(m[1])!;
    const discount = m[2] ? money(m[2]) : null;
    const net = discount ? new Decimal(gross).minus(discount).toFixed(2) : gross;
    if (discount && new Decimal(net).isNegative()) return `items "${cell}" ส่วนลดมากกว่าราคาเต็ม`;
    itemList.push({ gross: discount ? gross : null, discount, net, category: null });
  }

  const cats = row.item_categories ? row.item_categories.split("|").map((s) => s.trim()) : [];
  if (cats.length) {
    if (cats.length !== itemList.length)
      return `item_categories มี ${cats.length} ค่า แต่ items มี ${itemList.length} รายการ`;
    for (const [i, c] of cats.entries()) {
      const id = categoryId(c);
      if (!id) return `item_categories ไม่รู้จักหมวด "${c}" (ใช้ id: ${SYSTEM_CATEGORIES.map((x) => x.id).join(", ")})`;
      itemList[i].category = id;
    }
  }

  const billList: BillDiscount[] = [];
  for (const cell of (row.bill_discounts ?? "").split("|").map((s) => s.trim()).filter(Boolean)) {
    const [kindRaw, amountRaw] = cell.includes(":") ? cell.split(":") : ["discount", cell];
    const amount = money(amountRaw.replace(/^-/, ""));
    if (!amount) return `bill_discounts อ่านค่า "${cell}" ไม่ได้`;
    billList.push({ kind: normalizeKind(kindRaw), amount });
  }

  return { ...row, itemList, billList, hasCategories: cats.length > 0 };
}

// ------------------------------------------------------------------ ผลที่ระบบตอบ

/** ค่าที่ระบบตอบ (หลังผ่านขั้นตอนเดียวกับแอป) — เก็บไว้ให้คะแนนใหม่ได้เมื่อแก้เฉลย */
type Snapshot = {
  total: string | null;
  date: string | null;
  merchant: string | null;
  merchantType: string | null;
  vat: string | null;
  items: Item[];
  billDiscounts: BillDiscount[];
  /** ป๊อปอัพ "ไม่รองรับ" ที่แอปจะเด้ง (no_items, handwritten …) — null = ปกติ */
  unsupported: string | null;
};

/** ทำซ้ำขั้นตอนใน receipts.service.extract — ผลที่ประเมินจึงเป็นค่าที่ผู้ใช้เห็นในหน้าตรวจจริง */
function snapshotOf(payload: Record<string, unknown> | null): Snapshot {
  const d = enrich(parseDraft(payload));
  for (const item of d.line_items) {
    const guess = item.category_guess;
    item.category_guess = categoryId(guess ?? "") ?? categoryId(guess?.split(">").pop() ?? "") ?? null;
  }
  const guesses = new Map(d.line_items.map((i) => [i, i.category_guess]));
  if (d.merchant_type) {
    const type = merchantTypeOf(d.merchant_type);
    if (type.noItems) d.line_items = [];
    else for (const item of d.line_items) item.category_guess = categoryForItem(type, item.category_guess);
  }
  return {
    total: money(d.total),
    date: d.issued_at,
    merchant: d.merchant_name,
    merchantType: d.merchant_type,
    vat: money(d.vat_amount),
    items: d.line_items.flatMap((i): Item[] => {
      const net = money(i.amount);
      if (net === null) return [];
      return [{
        gross: money(i.gross_amount),
        discount: money(i.discount),
        net,
        category: i.category_guess,
        guess: guesses.get(i) ?? null,
      }];
    }),
    billDiscounts: d.bill_discounts
      .map((b) => ({ kind: b.kind as string, amount: money(b.amount) }))
      .filter((b): b is BillDiscount => b.amount !== null),
    unsupported: unsupportedReason(d)?.kind ?? null,
  };
}

/** ใช้กฎหมวดตามประเภทร้านชุดปัจจุบันกับหมวดที่ AI จัดไว้ (ผลรุ่นที่ยังไม่เก็บ guess ใช้ค่าเดิม) */
function withCurrentRule(snap: Snapshot): Snapshot {
  if (!snap.merchantType || snap.items.some((i) => i.guess === undefined)) return snap;
  const type = merchantTypeOf(snap.merchantType);
  return { ...snap, items: snap.items.map((i) => ({ ...i, category: categoryForItem(type, i.guess ?? null) })) };
}

// ------------------------------------------------------------------ ให้คะแนน

type CategoryPair = { truth: string; pred: string | null; amount: string };

type Scores = {
  cer: number | null;
  totalOk: boolean | null;
  totalInOcr: boolean | null;
  dateOk: boolean | null;
  merchantOk: boolean | null;
  merchantTypeOk: boolean | null;
  vatOk: boolean | null;
  billDiscountOk: boolean | null;
  /** ระบบเด้ง "ไม่พบรายการสินค้า" ทั้งที่เฉลยมีรายการ — ผู้ใช้บันทึกใบนี้ไม่ได้ */
  falseReject: boolean;
  itemTp: number;
  itemFp: number;
  itemFn: number;
  discTp: number;
  discFp: number;
  discFn: number;
  /** รายการที่จับคู่ได้และเฉลยมีหมวด — ใช้คิดชั้น 3 */
  categoryPairs: CategoryPair[];
  /** คะแนนต่อใบ (null = ใบนี้ไม่มีข้อมูลพอ) */
  s2: number | null;
  s3: number | null;
  exact: boolean | null;
  errors: ErrorRow[];
};

type Result = Scores & {
  v?: number;
  file: string;
  run: number;
  size: number;
  merchantType: string;
  condition: string;
  apiError: string | null;
  ocrMs: number;
  aiMs: number;
  /** ขนาดไฟล์ภาพที่ทดสอบ (หลังย่อ ก่อนเข้า OCR) */
  ocrKb: number;
  /** OCR ล้ม (timeout ฯลฯ) แล้ว AI อ่านจากรูปอย่างเดียว — แบบเดียวกับ readText ในแอป */
  ocrError?: string | null;
  snap: Snapshot | null;
};

/**
 * จับคู่รายการเฉลยกับที่ระบบอ่านได้ (ลำดับไม่สำคัญ ยอดซ้ำนับตามจำนวนครั้ง)
 * รอบแรกจับคู่ที่ราคาเต็ม+ส่วนลด+สุทธิตรงกันหมด รอบสองจับคู่ที่สุทธิตรงอย่างเดียว
 * — ใบที่มีสินค้าสุทธิเท่ากันสองชิ้นแต่ส่วนลดต่างกัน จึงจับคู่ถูกชิ้น
 */
function matchItems(truth: Item[], pred: Item[]) {
  const usedPred = new Set<number>();
  const pairOf = new Map<number, number>();
  const same = (a: Item, b: Item) =>
    a.net === b.net && (a.discount ?? null) === (b.discount ?? null) && (a.gross ?? a.net) === (b.gross ?? b.net);
  for (const strict of [true, false]) {
    for (const [ti, t] of truth.entries()) {
      if (pairOf.has(ti)) continue;
      const pi = pred.findIndex((p, i) => !usedPred.has(i) && (strict ? same(t, p) : t.net === p.net));
      if (pi >= 0) pairOf.set(ti, pi), usedPred.add(pi);
    }
  }
  return {
    pairs: [...pairOf].map(([ti, pi]) => ({ t: truth[ti], p: pred[pi] })),
    missing: truth.filter((_, i) => !pairOf.has(i)),
    extra: pred.filter((_, i) => !usedPred.has(i)),
  };
}

const sumOf = (xs: (string | null)[]) => xs.reduce((s, v) => s.plus(v ?? 0), new Decimal(0));

/** น้ำหนักของฟิลด์ในคะแนนชั้น 2 (ดูหัวไฟล์) */
const S2_WEIGHTS = { total: 0.4, date: 0.2, merchant: 0.15, vat: 0.1, items: 0.15 } as const;
const LAYER_WEIGHTS = { s2: 0.625, s3: 0.375 };

function score(t: Truth, s: Snapshot, ocrText: string): Scores {
  const pool = numbersIn(ocrText);
  const errors: ErrorRow[] = [];

  const truthTotal = money(t.total)!;
  const totalOk = s.total === truthTotal;
  if (!totalOk)
    errors.push({ field: "ยอดรวม", cause: classifyAmount(truthTotal, s.total, pool), truth: truthTotal, pred: s.total ?? "-" });

  // เฉลยเว้นวันที่ไว้ = บนใบอ่านวันที่ไม่ออกจริง (ซีด/เสียหาย) — ไม่นับคะแนนวันที่ของใบนี้
  const dateOk = t.date ? s.date === t.date : null;
  if (dateOk === false)
    errors.push({ field: "วันที่", cause: classifyDate(t.date, s.date, ocrText), truth: t.date, pred: s.date ?? "-" });

  const merchantOk = t.merchant ? merchantMatches(t.merchant, s.merchant) : null;
  const merchantTypeOk = t.merchant_type ? s.merchantType === appTypeOf(t.merchant_type) : null;

  const truthVat = money(t.vat);
  const vatOk = scoreVat(truthVat, s.vat);
  if (vatOk === false)
    errors.push({ field: "VAT", cause: classifyAmount(truthVat!, s.vat, pool), truth: truthVat!, pred: s.vat ?? "-" });

  const truthBill = sumOf(t.billList.map((b) => b.amount)).toFixed(2);
  const predBill = sumOf(s.billDiscounts.map((b) => b.amount)).toFixed(2);
  const billDiscountOk = truthBill === predBill;
  if (!billDiscountOk)
    errors.push({
      field: "ส่วนลดท้ายบิล",
      cause: truthBill === "0.00" ? (inOcr(predBill, pool) ? "aiExtra" : "hallucination") : classifyAmount(truthBill, predBill === "0.00" ? null : predBill, pool),
      truth: truthBill,
      pred: predBill,
    });

  // ---- รายการสินค้า (ชั้น 2)
  const { pairs, missing, extra } = matchItems(t.itemList, s.items);
  const extraLeft = [...extra];
  // ส่วนลดที่ AI แยกออกจากสินค้าไปไว้ท้ายบิล — ระบบได้สินค้าเป็นราคาเต็ม ส่วนลดไปอยู่ท้ายบิล
  // ยอดรวมยังถูก แต่ถ้าไม่แยกกรณีนี้ จะถูกนับเป็น "OCR อ่านตัวเลขผิด" (59.00 กับ 69.00 ต่างกันหลักเดียว)
  // นับ P/R/F1 ตามราคาสุทธิเหมือนเดิม (สุทธิผิดจริง) — แค่จัดสาเหตุให้ถูก
  const unexplained = [...missing];
  let movedDiscount = new Decimal(0);
  for (const v of missing) {
    if (!v.discount) continue;
    const idx = extraLeft.findIndex((p) => p.net === v.gross && !p.discount);
    if (idx < 0) continue;
    extraLeft.splice(idx, 1);
    unexplained.splice(unexplained.indexOf(v), 1);
    movedDiscount = movedDiscount.plus(v.discount);
    errors.push({ field: "ส่วนลดรายชิ้น", cause: "discountPlacement", truth: `${v.gross}-${v.discount}`, pred: `${v.gross} (ส่วนลดอยู่ท้ายบิล)` });
  }
  if (movedDiscount.gt(0)) {
    const bill = errors.find((e) => e.field === "ส่วนลดท้ายบิล");
    if (bill && new Decimal(bill.pred).minus(bill.truth).eq(movedDiscount)) bill.cause = "discountPlacement";
  }
  for (const v of unexplained) {
    // จับคู่ค่าที่อ่านผิดได้ครั้งเดียว — ค่าที่ถูกใช้อธิบายรายการหนึ่งแล้วไม่นับเป็น "เกิน" อีก
    const idx = extraLeft.findIndex((p) => digitConfusion(v.net, p.net));
    const confused = idx >= 0 ? extraLeft.splice(idx, 1)[0] : undefined;
    // สินค้าที่มีส่วนลด: บนใบพิมพ์ราคาเต็ม ไม่ใช่ราคาสุทธิ — เช็คราคาเต็มกับ OCR แทน
    const printed = v.gross ?? v.net;
    errors.push({
      field: "รายการสินค้า (ขาด)",
      cause: confused ? "digit" : inOcr(printed, pool) ? "aiDropped" : "ocrMissing",
      truth: v.discount ? `${v.gross}-${v.discount}` : v.net,
      pred: confused?.net ?? "-",
    });
  }
  for (const p of extraLeft) {
    errors.push({
      field: "รายการสินค้า (เกิน)",
      cause: inOcr(p.gross ?? p.net, pool) ? "aiExtra" : "hallucination",
      truth: "-",
      pred: p.discount ? `${p.gross}-${p.discount}` : p.net,
    });
  }

  // ---- ส่วนลดรายชิ้น: คิดเฉพาะรายการที่มีส่วนลด (ฝั่งเฉลยหรือฝั่งระบบ)
  const discTp = pairs.filter(({ t: a, p }) => a.discount !== null && a.discount === p.discount).length;
  const discFn = t.itemList.filter((i) => i.discount !== null).length - discTp;
  const discFp = s.items.filter((i) => i.discount !== null).length - discTp;
  for (const { t: a, p } of pairs) {
    if (a.discount !== p.discount && (a.discount !== null || p.discount !== null))
      errors.push({
        field: "ส่วนลดรายชิ้น",
        cause: a.discount === null ? "aiExtra" : p.discount === null ? (inOcr(a.discount, pool) ? "aiDropped" : "ocrMissing") : classifyAmount(a.discount, p.discount, pool),
        truth: a.discount ?? "-",
        pred: p.discount ?? "-",
      });
  }

  // ---- หมวดสินค้า (ชั้น 3)
  const categoryPairs: CategoryPair[] = pairs
    .filter(({ t: a }) => a.category !== null)
    .map(({ t: a, p }) => ({ truth: a.category!, pred: p.category, amount: a.net }));

  // ---- คะแนนต่อใบ
  const itemTp = pairs.length;
  const itemFp = s.items.length - itemTp;
  const itemFn = missing.length;
  const itemF1 = itemTp + itemFp + itemFn === 0 ? 1 : (2 * itemTp) / (2 * itemTp + itemFp + itemFn);
  const parts: [number, boolean | number | null][] = [
    [S2_WEIGHTS.total, totalOk],
    [S2_WEIGHTS.date, dateOk],
    [S2_WEIGHTS.merchant, merchantOk],
    [S2_WEIGHTS.vat, vatOk],
    [S2_WEIGHTS.items, itemF1],
  ];
  const scored = parts.filter(([, v]) => v !== null) as [number, boolean | number][];
  const wSum = scored.reduce((a, [w]) => a + w, 0);
  const s2 = wSum ? scored.reduce((a, [w, v]) => a + w * Number(v), 0) / wSum : null;

  // S3 ถ่วงด้วยเงิน และคิดทุกรายการในเฉลย — รายการที่ระบบอ่านไม่ได้ ไม่ได้เข้างบหมวดไหนเลย
  let s3: number | null = null;
  if (t.hasCategories && t.itemList.length) {
    const correct = new Set(categoryPairs.filter((c) => c.pred === c.truth).map((c) => c));
    const totalW = sumOf(t.itemList.map((i) => i.net));
    if (totalW.gt(0)) s3 = sumOf([...correct].map((c) => c.amount)).div(totalW).toNumber();
    else s3 = correct.size / t.itemList.length;
  }

  const categoriesOk = t.hasCategories ? categoryPairs.every((c) => c.pred === c.truth) : null;
  const exact =
    t.hasCategories || !t.itemList.length
      ? totalOk && dateOk !== false && merchantOk !== false && vatOk !== false && billDiscountOk &&
        itemFp === 0 && itemFn === 0 && discFp === 0 && discFn === 0 && categoriesOk !== false
      : null; // ยังไม่ได้กรอกหมวด — ตัดสินทั้งใบไม่ได้

  const truthTextFile = path.join(ROOT, "truth-text", `${path.parse(t.file).name}.txt`);
  return {
    cer: existsSync(truthTextFile) && ocrText ? cer(readFileSync(truthTextFile, "utf8"), ocrText) : null,
    totalOk,
    totalInOcr: ocrText ? inOcr(truthTotal, pool) : null,
    dateOk,
    merchantOk,
    merchantTypeOk,
    vatOk,
    billDiscountOk,
    falseReject: s.unsupported === "no_items" && t.itemList.length > 0,
    itemTp,
    itemFp,
    itemFn,
    discTp,
    discFp,
    discFn,
    categoryPairs,
    s2,
    s3,
    exact,
    errors,
  };
}

// ------------------------------------------------------------------ ประเภทร้าน

/**
 * ประเภทร้านในเฉลยละเอียดกว่าชุดของแอป (shared/merchant-types.ts) — ตาราง 2 ใช้ชื่อในเฉลย
 * ตรงๆ ส่วนการตัดสิน "ประเภทร้านถูก" แปลงเป็น id ของแอปผ่าน aliases ของประเภทร้านก่อนเทียบ
 * (beauty -> beauty_personal, medical -> pharmacy, cafe/fast_food -> restaurant,
 *  clothing/accessories -> department_fashion, wholesale -> supermarket, home_goods -> home_hardware,
 *  rent -> bills_services, sports/gift/entertainment -> general_other)
 */
const appTypeOf = (truthType: string) => matchMerchantType(truthType) ?? truthType;

/** ชื่อไทยของประเภทร้านในเฉลย สำหรับตาราง 2 (ชื่อที่ไม่อยู่ในนี้ใช้ชื่อของแอป หรือ id ตรงๆ) */
const TRUTH_TYPE_LABEL: Record<string, string> = {
  beauty: "ร้านความงาม/เครื่องสำอาง",
  medical: "ร้านขายยา/เวชภัณฑ์",
  cafe: "คาเฟ่/ร้านกาแฟ",
  fast_food: "ฟาสต์ฟู้ด",
  restaurant: "ร้านอาหาร",
  clothing: "เสื้อผ้า",
  accessories: "เครื่องประดับ/แอคเซสซอรี่",
  convenience: "ร้านสะดวกซื้อ",
  supermarket: "ซูเปอร์มาร์เก็ต",
  wholesale: "ค้าส่ง",
  rent: "ค่าเช่า/ที่พัก",
  sports: "อุปกรณ์กีฬา",
  gift: "ร้านของขวัญ",
  home_goods: "ของใช้ในบ้าน",
  entertainment: "บันเทิง",
  stationery: "เครื่องเขียน/หนังสือ",
  utilities: "ค่าน้ำ/ค่าไฟ",
};

// ------------------------------------------------------------------ ประเมินทีละใบ

const categoryList = SYSTEM_CATEGORIES.map((c) => c.name).join(" | ");
const ocrFile = (r: { file: string; size: number; run: number }) =>
  path.join(RAW, "ocr", `${path.parse(r.file).name}__${r.size}px__r${r.run}.txt`);

const EMPTY_SCORES: Scores = {
  cer: null, totalOk: null, totalInOcr: null, dateOk: null, merchantOk: null, merchantTypeOk: null,
  vatOk: null, billDiscountOk: null, falseReject: false,
  itemTp: 0, itemFp: 0, itemFn: 0, discTp: 0, discFp: 0, discFn: 0,
  categoryPairs: [], s2: null, s3: null, exact: null, errors: [],
};

async function evaluate(t: Truth, run: number, size: number): Promise<Result> {
  const base = {
    v: RESULT_VERSION,
    file: t.file,
    run,
    size,
    merchantType: t.merchant_type || "(ไม่ระบุ)",
    condition: t.condition || "(ไม่ระบุ)",
  };
  // จำลองขั้นอัปโหลดของแอป: หมุนตาม EXIF + ย่อ + JPEG 88
  // ย่อเหลือ "size" (ความละเอียดของภาพที่กำลังทดสอบ) — ทั้ง OCR และ AI เห็นภาพนี้
  // ถ้าย่อเฉพาะภาพที่ส่ง OCR, AI ยังอ่านจากภาพเต็มแล้วกลบผลของขนาดภาพจนวัดไม่ได้
  const raw = readFileSync(path.join(ROOT, "images", t.file));
  const stored = await sharp(raw)
    .rotate()
    .resize(size, size, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer();
  const prepared = await prepareForOcr(stored);

  let ocrText = "";
  let payload: Record<string, unknown> | null;
  let ocrMs = 0;
  let aiMs = 0;
  let ocrError: string | null = null;
  try {
    let t0 = Date.now();
    // แอปจริง (readText) กลืน error ของ OCR แล้วให้ AI อ่านจากรูปอย่างเดียว — ประเมินแบบเดียวกัน
    // ผลจึงตรงกับที่ผู้ใช้ได้ ยกเว้นโควตาหมด ซึ่งต้องหยุดทั้งชุด
    try {
      ocrText = await withRetry(() => requestOcr(prepared));
    } catch (err) {
      if (err instanceof Error && err.message === DAILY_LIMIT) throw err;
      ocrError = err instanceof Error ? err.message : String(err);
      console.log(`    OCR ไม่สำเร็จ (${ocrError}) — ให้ AI อ่านจากรูปอย่างเดียวเหมือนในแอป`);
    }
    ocrMs = Date.now() - t0;
    t0 = Date.now();
    ({ payload } = await withRetry(() => extractReceipt(stored, ocrText || null, categoryList)));
    aiMs = Date.now() - t0;
  } catch (err) {
    return {
      ...base,
      ...EMPTY_SCORES,
      apiError: err instanceof Error ? err.message : String(err),
      ocrMs, aiMs, ocrKb: Math.round(stored.length / 1024),
      snap: null,
    };
  }

  writeFileSync(ocrFile({ file: t.file, size, run }), ocrText);
  const snap = snapshotOf(payload);
  return {
    ...base,
    ...score(t, snap, ocrText),
    apiError: null,
    ocrMs,
    aiMs,
    ocrKb: Math.round(stored.length / 1024),
    ocrError,
    snap,
  };
}

// ------------------------------------------------------------------ สรุปเป็นตาราง

const pct = (num: number, den: number) => (den ? ((num / den) * 100).toFixed(1) : "-");
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const sd = (xs: number[]) => {
  const m = mean(xs);
  return m === null || xs.length < 2 ? null : Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
};
const fixed = (v: number | null, dp = 1) => (v === null ? "-" : v.toFixed(dp));

type RateKey = "totalOk" | "dateOk" | "merchantOk" | "merchantTypeOk" | "vatOk" | "totalInOcr" | "billDiscountOk" | "exact";
function rate(rs: Result[], key: RateKey) {
  const scored = rs.filter((r) => r[key] !== null);
  return { n: scored.length, ok: scored.filter((r) => r[key]).length };
}

function prf(tp: number, fp: number, fn: number) {
  const p = tp + fp ? tp / (tp + fp) : 0;
  const r = tp + fn ? tp / (tp + fn) : 0;
  return { tp, fp, fn, p, r, f1: p + r ? (2 * p * r) / (p + r) : 0 };
}
const total = (rs: Result[], k: "itemTp" | "itemFp" | "itemFn" | "discTp" | "discFp" | "discFn") =>
  rs.reduce((s, r) => s + r[k], 0);
const itemScores = (rs: Result[]) => prf(total(rs, "itemTp"), total(rs, "itemFp"), total(rs, "itemFn"));
const discountScores = (rs: Result[]) => prf(total(rs, "discTp"), total(rs, "discFp"), total(rs, "discFn"));

/** ชั้น 3: accuracy, macro-F1 (เฉลี่ยทุกหมวดที่มีในเฉลย), amount-weighted accuracy */
function categoryScores(rs: Result[]) {
  const pairs = rs.flatMap((r) => r.categoryPairs);
  const correct = pairs.filter((p) => p.pred === p.truth);
  const classes = [...new Set(pairs.map((p) => p.truth))];
  const perClass = classes.map((c) => {
    const tp = pairs.filter((p) => p.truth === c && p.pred === c).length;
    const fp = pairs.filter((p) => p.truth !== c && p.pred === c).length;
    const fn = pairs.filter((p) => p.truth === c && p.pred !== c).length;
    return { id: c, n: tp + fn, ...prf(tp, fp, fn) };
  });
  const amountAll = sumOf(pairs.map((p) => p.amount));
  const amountOk = sumOf(correct.map((p) => p.amount));
  return {
    pairs,
    n: pairs.length,
    accuracy: pairs.length ? correct.length / pairs.length : null,
    macroF1: perClass.length ? perClass.reduce((a, c) => a + c.f1, 0) / perClass.length : null,
    weighted: amountAll.gt(0) ? amountOk.div(amountAll).toNumber() : null,
    perClass: perClass.sort((a, b) => b.n - a.n),
  };
}

function groupTable(rs: Result[], key: "merchantType" | "condition", label: string) {
  const groups = new Map<string, Result[]>();
  for (const r of rs) groups.set(r[key], [...(groups.get(r[key]) ?? []), r]);
  const rows: (string | number | null)[][] = [
    [label, "จำนวนใบ", "ยอดรวมถูก (%)", "วันที่ถูก (%)", "ชื่อร้านถูก (%)", "รายการสินค้า F1 (%)",
      "หมวดสินค้าถูก (%)", "CER เฉลี่ย (%)"],
  ];
  for (const [g, list] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
    const name =
      key === "merchantType"
        ? (TRUTH_TYPE_LABEL[g] ?? MERCHANT_TYPES.find((m) => m.id === g)?.name ?? g)
        : g;
    const cers = list.map((r) => r.cer).filter((v): v is number => v !== null);
    const cat = categoryScores(list);
    rows.push([
      name,
      list.length,
      pct(rate(list, "totalOk").ok, rate(list, "totalOk").n),
      pct(rate(list, "dateOk").ok, rate(list, "dateOk").n),
      pct(rate(list, "merchantOk").ok, rate(list, "merchantOk").n),
      (itemScores(list).f1 * 100).toFixed(1),
      cat.accuracy === null ? "-" : (cat.accuracy * 100).toFixed(1),
      cers.length ? fixed(mean(cers)! * 100) : "-",
    ]);
  }
  return rows;
}

// ------------------------------------------------------------------ main

const truthFile = path.join(ROOT, "ground-truth.csv");
if (!existsSync(truthFile)) {
  console.error(
    `ไม่พบ ${truthFile}\nคัดลอก evaluation/ground-truth.example.csv เป็น ${ROOT_NAME}/ground-truth.csv แล้วกรอกเฉลยของรูปใน ${ROOT_NAME}/images/`,
  );
  process.exit(1);
}
const rows = (parseCsv(readFileSync(truthFile, "utf8")) as TruthRow[]).filter((t) => t.file).slice(0, limit);

const problems: string[] = [];
const truths: Truth[] = [];
// ระบบอ่านรูปละ 1 ใบเสร็จ — ไฟล์เดียวกันสองแถวจะทับผลกันเอง (รูปที่มีหลายบิลให้ครอปแยกเป็นคนละไฟล์)
const seen = new Set<string>();
for (const row of rows) {
  if (seen.has(row.file)) problems.push(`${row.file}: มีมากกว่า 1 แถว — 1 รูปต้องมีเฉลย 1 แถว`);
  seen.add(row.file);
  if (!money(row.total)) problems.push(`${row.file}: total ต้องเป็นตัวเลข`);
  if (row.date && !/^\d{4}-\d{2}-\d{2}$/.test(row.date))
    problems.push(`${row.file}: date ต้องเป็น YYYY-MM-DD (หรือเว้นว่างถ้าบนใบอ่านวันที่ไม่ออก)`);
  if (!existsSync(path.join(ROOT, "images", row.file))) problems.push(`${row.file}: ไม่พบรูปใน ${ROOT_NAME}/images/`);
  const t = parseTruth(row);
  if (typeof t === "string") problems.push(`${row.file}: ${t}`);
  else {
    // ยอดรวมควรเท่ากับ สุทธิของรายการ − ส่วนลดท้ายบิล — ไม่ตรง = เฉลยน่าจะกรอกผิด (เตือนเฉยๆ
    // เพราะบางใบมีค่าบริการ/ปัดเศษที่ไม่ได้อยู่ในรายการ)
    const expect = sumOf(t.itemList.map((i) => i.net)).minus(sumOf(t.billList.map((b) => b.amount)));
    if (t.itemList.length && money(t.total) && !expect.eq(money(t.total)!))
      console.log(`⚠️ ${t.file}: รายการ − ส่วนลดท้ายบิล = ${expect.toFixed(2)} แต่ total = ${money(t.total)} — ตรวจเฉลยอีกที`);
    truths.push(t);
  }
}
if (problems.length) {
  console.error("เฉลยยังกรอกไม่ถูกรูปแบบ:\n  " + problems.join("\n  "));
  process.exit(1);
}
const unknownTypes = [
  ...new Set(truths.map((t) => t.merchant_type).filter((m) => m && !MERCHANT_TYPES.some((x) => x.id === appTypeOf(m)))),
];
if (unknownTypes.length) {
  console.log(`⚠️ ประเภทร้านในเฉลยที่แปลงเป็นของแอปไม่ได้ (นับว่าผิดเสมอ): ${unknownTypes.join(", ")} — เพิ่มใน aliases ของ shared/merchant-types.ts`);
}
const noDate = truths.filter((t) => !t.date);
if (noDate.length) {
  console.log(`ℹ️ ไม่คิดคะแนนวันที่ของ ${noDate.length} ใบที่เฉลยเว้นวันที่ไว้: ${noDate.map((t) => t.file).join(", ")}`);
}
const noCats = truths.filter((t) => t.itemList.length && !t.hasCategories);
if (noCats.length) {
  console.log(`ℹ️ ยังไม่ได้กรอก item_categories ${noCats.length} ใบ — ไม่คิดคะแนนหมวด/Exact Match ของใบเหล่านี้`);
}
if (checkOnly) {
  console.log(`✓ เฉลย ${truths.length} ใบอ่านได้ครบ`);
  process.exit(0);
}

mkdirSync(path.join(RAW, "ocr"), { recursive: true });
const runCount = truths.length * sizes.length * runs;

// ผลที่ผ่านแล้วจากครั้งก่อน (เก็บทุกครั้งที่ประเมินเสร็จหนึ่งใบ) — --resume ข้ามตัวที่ผ่านแล้ว
const STATE = path.join(RAW, "results.json");
const inTruthFiles = new Set(truths.map((t) => t.file));
const keyOf = (r: { file: string; size: number; run: number }) => `${r.file}|${r.size}|${r.run}`;
// โหลดผลเดิมเสมอเพื่อไม่ให้ทับของที่สะสมไว้ — --resume แค่ตัดสินว่าจะข้ามตัวที่ผ่านแล้วไหม
// (ไม่ใส่ --resume = ประเมินใหม่ทุกตัวที่สั่ง แล้วเขียนทับเฉพาะ key เดียวกัน)
// ผลรุ่นเก่า (ไม่มี snap) เก็บไว้ในไฟล์ตามเดิมแต่ไม่นับ — ใบนั้นจะถูกประเมินใหม่
const stored = (existsSync(STATE) ? (JSON.parse(readFileSync(STATE, "utf8")) as Result[]) : []).filter(
  (r) => !r.apiError,
);
const legacy = stored.filter((r) => r.v !== RESULT_VERSION);
const store = new Map<string, Result>(stored.filter((r) => r.v === RESULT_VERSION).map((r) => [keyOf(r), r]));
const saveState = () => writeFileSync(STATE, JSON.stringify([...legacy, ...store.values()]));
const done0 = resume
  ? [...store.keys()].filter((k) => {
      const [file, size, run] = k.split("|");
      return inTruthFiles.has(file) && sizes.includes(Number(size)) && Number(run) <= runs;
    }).length
  : 0;
const todo = only ? only.length * sizes.length * runs : runCount - done0;
const unknownOnly = (only ?? []).filter((f) => !inTruthFiles.has(f));
if (unknownOnly.length) {
  console.error(`--only มีชื่อไฟล์ที่ไม่อยู่ในเฉลย: ${unknownOnly.join(", ")}`);
  process.exit(1);
}
if (legacy.length) {
  console.log(`ℹ️ ผลรุ่นก่อน ${legacy.length} ครั้งไม่ถูกนับ (ระบบรุ่นเก่า ไม่มีข้อมูลส่วนลด/หมวดรายชิ้น) — ต้องประเมินใหม่`);
}
console.log(
  `ประเมิน ${truths.length} ใบ × ${sizes.length} ขนาด × ${runs} รอบ = ${runCount} ครั้ง` +
    (only ? ` (ประเมินใหม่เฉพาะ ${only.length} ใบ)` : resume ? ` (ผ่านแล้ว ${done0}, เหลือ ${todo})` : "") +
    ` — จะเรียก API ประมาณ ${todo * 2} ครั้ง`,
);

const results: Result[] = [];
let done = 0;
let streak = 0;
let aborted = false;
outer: for (let run = 1; run <= runs; run++) {
  for (const size of sizes) {
    for (const t of truths) {
      done++;
      const key = keyOf({ file: t.file, size, run });
      if (only && !only.includes(t.file)) {
        const kept = store.get(key);
        if (kept) results.push(kept);
        continue;
      }
      const cached = resume && !only ? store.get(key) : undefined;
      if (cached) {
        results.push(cached);
        continue;
      }
      const r = await evaluate(t, run, size);
      results.push(r);
      // เก็บเฉพาะที่ผ่าน — ครั้งที่ API ล้มไม่ทับผลดีที่เคยได้ของ key เดียวกัน
      if (!r.apiError) {
        store.set(keyOf(r), r);
        saveState();
      }
      streak = r.apiError ? streak + 1 : 0;
      if (r.apiError === DAILY_LIMIT) {
        console.log(`\n⛔ ${DAILY_LIMIT} (ประเมินแล้ว ${store.size} ครั้ง) — รอวันถัดไปแล้วรันคำสั่งเดิมต่อท้ายด้วย --resume`);
        aborted = true;
        break outer;
      }
      if (streak >= MAX_CONSECUTIVE_API_ERRORS) {
        console.log(`\n⛔ API ล้มติดกัน ${streak} ครั้ง — หยุดก่อนเพื่อไม่ให้เปลืองโควตา`);
        console.log(`   ล่าสุด: ${r.apiError}`);
        console.log(`   รอสักพักแล้วรันคำสั่งเดิมต่อท้ายด้วย --resume ระบบจะประเมินต่อจากที่ค้างไว้`);
        aborted = true;
        break outer;
      }
      const mark = r.apiError
        ? `⚠️ API error: ${r.apiError.slice(0, 60)}`
        : `ยอดรวม ${r.totalOk ? "✓" : "✗"} วันที่ ${r.dateOk === null ? "-" : r.dateOk ? "✓" : "✗"} ` +
          `รายการ ${r.itemTp}/${r.itemTp + r.itemFn}` +
          (r.categoryPairs.length ? ` หมวด ${r.categoryPairs.filter((c) => c.pred === c.truth).length}/${r.categoryPairs.length}` : "") +
          (r.falseReject ? " ⛔ระบบปฏิเสธใบ" : "");
      console.log(`[${done}/${runCount}] รอบ ${run} ${size}px ${t.file} — ${mark}`);
      await sleep(500); // เว้นช่วงกันโดนจำกัดการเรียก
    }
  }
}

/**
 * ตารางคิดจากผลทั้งหมดที่สะสมไว้ (ทุกขนาดที่เคยรันผ่าน) ไม่ใช่แค่รอบนี้
 * จึงแบ่งรันทีละขนาดข้ามวันได้ (โควตา API รายวัน) แล้วตารางยังครบทุกขนาด
 * ใช้เฉพาะใบที่ยังอยู่ในเฉลยตอนนี้ และให้คะแนนใหม่จากค่าที่ระบบตอบซึ่งเก็บไว้ —
 * แก้เฉลยแล้วรัน --resume ตารางเปลี่ยนตามโดยไม่ต้องเรียก API
 */
const truthByFile = new Map(truths.map((t) => [t.file, t]));
const cumulative: Result[] = [...store.values()]
  .filter((r) => truthByFile.has(r.file) && r.snap)
  .map((r) => {
    const text = existsSync(ocrFile(r)) ? readFileSync(ocrFile(r), "utf8") : "";
    const snap = withCurrentRule(r.snap!);
    return { ...r, snap, ...score(truthByFile.get(r.file)!, snap, text) };
  });
const ok = cumulative.filter((r) => !r.apiError);
const ranSizes = [...new Set(ok.map((r) => r.size))].sort((a, b) => a - b);
/**
 * ตาราง 1, 2, 4, 5, 6 ใช้ขนาดที่แอปใช้จริงถ้ามีผลแล้ว ไม่งั้นใช้ขนาดใหญ่สุดที่มี
 * --table-size=N บังคับขนาดเอง (เช่นตอนขนาดใหญ่สุดยังรันไม่ครบทุกใบ)
 */
const tableSize = arg("table-size")
  ? Number(arg("table-size"))
  : ranSizes.includes(PRODUCTION_SIZE)
    ? PRODUCTION_SIZE
    : Math.max(...ranSizes, 0);
const main = ok.filter((r) => r.size === tableSize);
const apiErrors = results.filter((r) => r.apiError).length;

const itemText = (i: Item) => `${i.discount ? `${i.gross}-${i.discount}` : i.net}${i.category ? `[${i.category}]` : ""}`;

// raw: ทุกใบทุกขนาด
writeCsv(path.join(RAW, "per-receipt.csv"), [
  ["file", "run", "size_px", "merchant_type", "condition", "ocr_ms", "ai_ms", "image_kb", "cer",
    "total_ok", "total_pred", "total_in_ocr", "date_ok", "date_pred", "merchant_ok", "merchant_pred",
    "merchant_type_ok", "merchant_type_pred", "vat_ok", "vat_pred", "bill_discount_ok", "bill_discounts_pred",
    "item_tp", "item_fp", "item_fn", "disc_tp", "disc_fp", "disc_fn", "category_ok", "category_n",
    "s2", "s3", "receipt_score", "exact_match", "unsupported", "items_pred", "errors"],
  ...cumulative.map((r) => {
    const s = r.snap!;
    const score = r.s2 === null ? null : r.s3 === null ? r.s2 : LAYER_WEIGHTS.s2 * r.s2 + LAYER_WEIGHTS.s3 * r.s3;
    return [
      r.file, r.run, r.size, r.merchantType, r.condition, r.ocrMs, r.aiMs, r.ocrKb, r.cer === null ? null : r.cer.toFixed(4),
      String(r.totalOk), s.total, String(r.totalInOcr), String(r.dateOk), s.date, String(r.merchantOk), s.merchant,
      String(r.merchantTypeOk), s.merchantType, String(r.vatOk), s.vat, String(r.billDiscountOk),
      s.billDiscounts.map((b) => `${b.kind}:${b.amount}`).join("|"),
      r.itemTp, r.itemFp, r.itemFn, r.discTp, r.discFp, r.discFn,
      r.categoryPairs.filter((c) => c.pred === c.truth).length, r.categoryPairs.length,
      fixed(r.s2, 3), fixed(r.s3, 3), fixed(score, 3), String(r.exact), s.unsupported,
      s.items.map(itemText).join("|"),
      r.errors.map((e) => `${e.field}: ${e.truth}→${e.pred} [${CAUSES[e.cause]}]`).join(" ; "),
    ];
  }),
]);

// ตาราง 1
const items = itemScores(main);
const disc = discountScores(main);
const cers = main.map((r) => r.cer).filter((v): v is number => v !== null);
const row1 = (name: string, k: RateKey) => {
  const { n, ok: c } = rate(main, k);
  return [name, n, c, pct(c, n)];
};
const rejected = main.filter((r) => r.falseReject).length;
const ocrFailed = main.filter((r) => r.ocrError).length;
writeCsv(path.join(OUT, "table1-accuracy.csv"), [
  ["ตัวชี้วัด", "จำนวนที่ประเมิน", "ถูกต้อง", "ความแม่นยำ (%)"],
  row1("ยอดรวม (total)", "totalOk"),
  row1("วันที่ (date)", "dateOk"),
  row1("ชื่อร้าน (merchant)", "merchantOk"),
  row1("ประเภทร้าน (merchant type)", "merchantTypeOk"),
  row1("VAT", "vatOk"),
  row1("ส่วนลดท้ายบิล (ผลรวม)", "billDiscountOk"),
  row1("OCR อ่านยอดรวมได้ถูก (ก่อนผ่าน AI)", "totalInOcr"),
  ["รายการสินค้า — Precision", items.tp + items.fp, items.tp, (items.p * 100).toFixed(1)],
  ["รายการสินค้า — Recall", items.tp + items.fn, items.tp, (items.r * 100).toFixed(1)],
  ["รายการสินค้า — F1", "-", "-", (items.f1 * 100).toFixed(1)],
  ["ส่วนลดรายชิ้น — Precision", disc.tp + disc.fp, disc.tp, disc.tp + disc.fp ? (disc.p * 100).toFixed(1) : "-"],
  ["ส่วนลดรายชิ้น — Recall", disc.tp + disc.fn, disc.tp, disc.tp + disc.fn ? (disc.r * 100).toFixed(1) : "-"],
  ["ส่วนลดรายชิ้น — F1", "-", "-", disc.tp + disc.fp + disc.fn ? (disc.f1 * 100).toFixed(1) : "-"],
  ["ระบบปฏิเสธใบที่มีรายการสินค้า (ยิ่งต่ำยิ่งดี)", main.length, rejected, pct(rejected, main.length)],
  ["OCR ล้มเหลว — AI อ่านจากรูปอย่างเดียว (ยิ่งต่ำยิ่งดี)", main.length, ocrFailed, pct(ocrFailed, main.length)],
  ["CER ของข้อความ OCR (ยิ่งต่ำยิ่งดี)", cers.length, "-", cers.length ? fixed(mean(cers)! * 100, 2) : "-"],
  ["เวลา OCR เฉลี่ย (วินาที)", main.length, "-", fixed((mean(main.map((r) => r.ocrMs)) ?? 0) / 1000, 2)],
  ["เวลา AI เฉลี่ย (วินาที)", main.length, "-", fixed((mean(main.map((r) => r.aiMs)) ?? 0) / 1000, 2)],
]);

// ตาราง 2
writeCsv(path.join(OUT, "table2-by-merchant-type.csv"), groupTable(main, "merchantType", "ประเภทร้าน"));
writeCsv(path.join(OUT, "table2-by-condition.csv"), groupTable(main, "condition", "สภาพภาพ"));

// ตาราง 3
const t3: (string | number | null)[][] = [
  ["ด้านยาวของภาพ (px)", "จำนวนครั้ง", "ขนาดไฟล์เฉลี่ย (KB)", "เวลา OCR เฉลี่ย (วินาที)",
    "OCR อ่านยอดรวมถูก (%)", "ยอดรวมถูก (%)", "วันที่ถูก (%)", "รายการสินค้า F1 (%)", "CER เฉลี่ย (%)"],
];
for (const size of ranSizes) {
  const list = ok.filter((r) => r.size === size);
  const c = list.map((r) => r.cer).filter((v): v is number => v !== null);
  t3.push([
    size,
    list.length,
    fixed(mean(list.map((r) => r.ocrKb)), 0),
    fixed((mean(list.map((r) => r.ocrMs)) ?? 0) / 1000, 2),
    pct(rate(list, "totalInOcr").ok, rate(list, "totalInOcr").n),
    pct(rate(list, "totalOk").ok, rate(list, "totalOk").n),
    pct(rate(list, "dateOk").ok, rate(list, "dateOk").n),
    (itemScores(list).f1 * 100).toFixed(1),
    c.length ? fixed(mean(c)! * 100, 2) : "-",
  ]);
}
writeCsv(path.join(OUT, "table3-image-size.csv"), t3);

// ตาราง 4
const allErrors = main.flatMap((r) => r.errors.map((e) => ({ ...e, file: r.file })));
const t4: (string | number | null)[][] = [["สาเหตุ", "จำนวนครั้ง", "สัดส่วน (%)", "ฟิลด์ที่พบ", "ตัวอย่าง (เฉลย → ที่อ่านได้)"]];
for (const cause of Object.keys(CAUSES) as Cause[]) {
  const list = allErrors.filter((e) => e.cause === cause);
  if (!list.length) continue;
  t4.push([
    CAUSES[cause],
    list.length,
    pct(list.length, allErrors.length),
    [...new Set(list.map((e) => e.field))].join(", "),
    list.slice(0, 3).map((e) => `${e.truth} → ${e.pred}`).join(" ; "),
  ]);
}
t4.push(["รวม", allErrors.length, allErrors.length ? "100.0" : "-", "", ""]);
writeCsv(path.join(OUT, "table4-error-causes.csv"), t4);

// ตาราง 5 — ชั้นจัดหมวดหมู่
const cat = categoryScores(main);
const pctOf = (v: number | null) => (v === null ? "-" : (v * 100).toFixed(1));
writeCsv(path.join(OUT, "table5-item-categories.csv"), [
  ["ตัวชี้วัด / หมวด", "จำนวนรายการ", "Precision (%)", "Recall (%)", "F1 (%)"],
  ["Accuracy (นับตามจำนวนรายการ)", cat.n, "-", "-", pctOf(cat.accuracy)],
  ["Macro-F1 (เฉลี่ยทุกหมวดเท่ากัน)", cat.n, "-", "-", pctOf(cat.macroF1)],
  ["Amount-weighted accuracy (ถ่วงด้วยราคาสุทธิ)", cat.n, "-", "-", pctOf(cat.weighted)],
  [],
  ...cat.perClass.map((c) => [categoryName(c.id), c.n, pctOf(c.p), pctOf(c.r), pctOf(c.f1)]),
]);
const predClasses = [...new Set(cat.pairs.map((p) => p.pred))];
const cmCols = [...cat.perClass.map((c) => c.id as string | null), ...predClasses.filter((p) => !cat.perClass.some((c) => c.id === p))];
writeCsv(path.join(OUT, "table5-confusion-matrix.csv"), [
  ["เฉลย \\ ระบบจัดเป็น", ...cmCols.map(categoryName)],
  ...cat.perClass.map((c) => [
    categoryName(c.id),
    ...cmCols.map((p) => cat.pairs.filter((x) => x.truth === c.id && x.pred === p).length),
  ]),
]);

// ตาราง 6 — คะแนนรวมต่อใบ
const receiptScore = (r: Result, w2: number) =>
  r.s2 === null ? null : r.s3 === null ? r.s2 : w2 * r.s2 + (1 - w2) * r.s3;
const summarize = (xs: number[]) => {
  const m = mean(xs);
  const s = sd(xs);
  const half = s === null ? null : (1.96 * s) / Math.sqrt(xs.length);
  return [xs.length, fixed(m === null ? null : m * 100), fixed(s === null ? null : s * 100),
    m === null || half === null ? "-" : `${(Math.max(0, m - half) * 100).toFixed(1)} – ${(Math.min(1, m + half) * 100).toFixed(1)}`];
};
const scoresAt = (w2: number) => main.map((r) => receiptScore(r, w2)).filter((v): v is number => v !== null);
const exactRate = rate(main, "exact");
writeCsv(path.join(OUT, "table6-receipt-score.csv"), [
  ["ตัวชี้วัดต่อใบ", "จำนวนใบ", "ค่าเฉลี่ย (%)", "SD (%)", "ช่วงความเชื่อมั่น 95% (%)"],
  ["Exact Match (ถูกทั้งใบ ไม่ต้องแก้)", exactRate.n, pct(exactRate.ok, exactRate.n), "-", "-"],
  ["S2 ชั้นแยกฟิลด์ (weighted sum)", ...summarize(main.map((r) => r.s2).filter((v): v is number => v !== null))],
  ["S3 ชั้นจัดหมวด (amount-weighted)", ...summarize(main.map((r) => r.s3).filter((v): v is number => v !== null))],
  [`คะแนนรวม ${LAYER_WEIGHTS.s2} S2 + ${LAYER_WEIGHTS.s3} S3`, ...summarize(scoresAt(LAYER_WEIGHTS.s2))],
  ["Sensitivity: 0.5 S2 + 0.5 S3", ...summarize(scoresAt(0.5))],
  ["Sensitivity: 0.75 S2 + 0.25 S3", ...summarize(scoresAt(0.75))],
]);

console.log(`\nเสร็จแล้ว — ตารางอยู่ใน ${path.relative(process.cwd(), OUT)}/ (ตาราง 1, 2, 4, 5, 6 ใช้ผลที่ ${tableSize}px, ${main.length} ใบ)`);
if (apiErrors || aborted) {
  console.log(
    `⚠️ ยังประเมินไม่ครบ (API ไม่สำเร็จ ${apiErrors} ครั้ง${aborted ? ", หยุดกลางทาง" : ""}) — ` +
      `ตารางตอนนี้นับเฉพาะที่ผ่าน รันคำสั่งเดิมต่อท้ายด้วย --resume เพื่อเก็บส่วนที่เหลือ`,
  );
}
