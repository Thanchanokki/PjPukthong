/**
 * ประเมินความแม่นยำของการอ่านใบเสร็จ (Typhoon OCR -> AI) เทียบกับเฉลยที่คนพิมพ์เอง
 * แล้วออกตารางสรุปเป็น CSV สำหรับใส่รายงาน
 *
 *   npm run evaluate                         # ขนาดเดียว (2400px = ค่าที่แอปใช้จริง) 1 รอบ
 *   npm run evaluate -- --sizes=800,1200,1600,2000,2400 --runs=2
 *   npm run evaluate -- --limit=3            # ลองแค่ 3 ใบแรกก่อน (เช็คว่าเฉลยกรอกถูก)
 *   npm run evaluate -- --sizes=... --resume # รันต่อเฉพาะครั้งที่ยังไม่ผ่าน (API ล้มกลางทาง)
 *   npm run evaluate -- --sizes=1200 --resume --table-size=1200   # ทำตารางจากผลที่มี ไม่เรียก API
 *
 * อินพุต (อยู่ใน evaluation/ — ห้าม commit รูปและเฉลยจริง ดู .gitignore):
 *   images/<file>                รูปใบเสร็จต้นฉบับ
 *   ground-truth.csv             เฉลย 1 แถว/ใบ (รูปแบบเดียวกับ ground-truth.example.csv)
 *   truth-text/<file ไม่มีนามสกุล>.txt   (ไม่บังคับ) ข้อความทั้งใบ ใช้คิด CER
 *
 * เอาต์พุต evaluation/results/:
 *   table1-accuracy.csv          ความแม่นยำรายฟิลด์ (ที่ขนาดภาพที่แอปใช้จริง)
 *   table2-by-merchant-type.csv  แยกตามประเภทร้าน
 *   table2-by-condition.csv      แยกตามสภาพภาพ
 *   table3-image-size.csv        ขนาดภาพ vs ความถูกต้อง (ย่อรูปต้นฉบับเหลือด้านยาว N px
 *                                แล้วให้ผ่านระบบตามปกติทั้ง OCR และ AI — เหมือนผู้ใช้ถ่ายมาที่ความละเอียดนั้น)
 *   table4-error-causes.csv      จำแนกสาเหตุของข้อผิดพลาด
 *   raw/per-receipt.csv          ผลทุกใบทุกขนาด (มีข้อมูลจากใบจริง — ไม่ขึ้น git)
 *   raw/ocr/*.txt                ข้อความ OCR ดิบ ไว้ตรวจทานสาเหตุด้วยตา
 *
 * กติกาการนับ (ควรเขียนไว้ในรายงาน):
 *   - ยอดเงินถูก = ตรงกับเฉลยที่ทศนิยม 2 ตำแหน่ง (ไม่มีช่วงคลาดเคลื่อน)
 *   - VAT: เฉลย 0.00 กับ AI ตอบว่าไม่มี (null) ถือว่าตรงกัน (ใบที่ไม่มี VAT)
 *   - วันที่ถูก = ตรงทุกหลัก YYYY-MM-DD (หลังแปลง พ.ศ. เป็น ค.ศ.) — เฉลยเว้นว่าง = ไม่คิดคะแนนใบนั้น
 *   - ชื่อร้านถูก = หลังตัดช่องว่าง/เครื่องหมาย ชื่อหนึ่งอยู่ในอีกชื่อ หรือคล้ายกัน ≥ 80%
 *   - รายการสินค้า = จับคู่ยอดเงินแบบ multiset แล้วคิด precision / recall / F1
 *   - CER = edit distance / ความยาวเฉลย (ตัดช่องว่าง แท็ก HTML และสัญลักษณ์ markdown ออกก่อน)
 *   - ใบที่เรียก API ไม่สำเร็จ (ล่ม/โดนจำกัด) ไม่ถูกนับเป็นผิด แต่แจ้งจำนวนแยกไว้
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";

import { amountIsGrounded, dateIsGrounded, numbersIn } from "../modules/receipts/confidence.js";
import { extractReceipt } from "../modules/receipts/ai.provider.js";
import { prepareForOcr, requestOcr } from "../modules/receipts/ocr.provider.js";
import { parseDraft } from "../modules/receipts/receipts.schema.js";
import { SYSTEM_CATEGORIES } from "../shared/categories.js";
import { MERCHANT_TYPES } from "../shared/merchant-types.js";
import { Decimal } from "../shared/money.js";

const ROOT = path.resolve("evaluation");
const OUT = path.join(ROOT, "results");
const RAW = path.join(OUT, "raw");
/** ขนาดที่แอปใช้จริง — ตาราง 1, 2, 4 ใช้ผลที่ขนาดนี้ */
const PRODUCTION_SIZE = 2400;

// ------------------------------------------------------------------ CLI

const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const sizes = (arg("sizes") ?? String(PRODUCTION_SIZE)).split(",").map(Number);
const runs = Number(arg("runs") ?? 1);
const limit = arg("limit") ? Number(arg("limit")) : Infinity;
const resume = process.argv.includes("--resume");
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
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const e = err as { status?: number; name?: string; message?: string; cause?: { status?: number; name?: string } };
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

// ------------------------------------------------------------------ ประเมินทีละใบ

type Truth = {
  file: string;
  merchant_type: string;
  condition: string;
  merchant: string;
  date: string;
  total: string;
  vat: string;
  items: string;
};

type Result = {
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
  cer: number | null;
  totalOk: boolean | null;
  totalInOcr: boolean | null;
  dateOk: boolean | null;
  merchantOk: boolean | null;
  merchantTypeOk: boolean | null;
  vatOk: boolean | null;
  itemTp: number;
  itemFp: number;
  itemFn: number;
  pred: { total: string | null; date: string | null; merchant: string | null; vat: string | null };
  errors: ErrorRow[];
};

const categoryList = SYSTEM_CATEGORIES.map((c) => c.name).join(" | ");

/**
 * ประเภทร้านในเฉลยละเอียดกว่าชุดของแอป (shared/merchant-types.ts) — ตาราง 2 ใช้ชื่อในเฉลย
 * ตรงๆ ส่วนการตัดสิน "ประเภทร้านถูก" ต้องแปลงเป็น id ของแอปก่อนเทียบ
 * ชื่อที่ตรงกับ id ของแอปอยู่แล้ว (เช่น convenience, restaurant) ไม่ต้องอยู่ในตารางนี้
 * ⚠️ ตัวที่ก้ำกึ่ง (sports, gift, home_goods) ตัดสินเป็น other_shop — แก้ได้ถ้าเห็นต่าง
 */
const TRUTH_TO_APP_TYPE: Record<string, string> = {
  beauty: "pharmacy_beauty",
  medical: "pharmacy_beauty",
  cafe: "restaurant",
  fast_food: "restaurant",
  clothing: "fashion",
  accessories: "fashion",
  supermarket: "convenience",
  wholesale: "convenience",
  rent: "housing_bills",
  sports: "other_shop",
  gift: "other_shop",
  home_goods: "other_shop",
};
const appTypeOf = (truthType: string) => TRUTH_TO_APP_TYPE[truthType] ?? truthType;

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
};

async function evaluate(t: Truth, run: number, size: number): Promise<Result> {
  const base = {
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
  try {
    let t0 = Date.now();
    ocrText = await withRetry(() => requestOcr(prepared));
    ocrMs = Date.now() - t0;
    t0 = Date.now();
    ({ payload } = await withRetry(() => extractReceipt(stored, ocrText || null, categoryList)));
    aiMs = Date.now() - t0;
  } catch (err) {
    return {
      ...base,
      apiError: err instanceof Error ? err.message : String(err),
      ocrMs, aiMs, ocrKb: Math.round(stored.length / 1024), cer: null,
      totalOk: null, totalInOcr: null, dateOk: null, merchantOk: null, merchantTypeOk: null, vatOk: null,
      itemTp: 0, itemFp: 0, itemFn: 0,
      pred: { total: null, date: null, merchant: null, vat: null },
      errors: [],
    };
  }

  writeFileSync(
    path.join(RAW, "ocr", `${path.parse(t.file).name}__${size}px__r${run}.txt`),
    ocrText,
  );

  const d = parseDraft(payload);
  const pool = numbersIn(ocrText);
  const errors: ErrorRow[] = [];

  const truthTotal = money(t.total)!;
  const predTotal = money(d.total);
  const totalOk = predTotal === truthTotal;
  if (!totalOk)
    errors.push({ field: "ยอดรวม", cause: classifyAmount(truthTotal, predTotal, pool), truth: truthTotal, pred: predTotal ?? "-" });

  // เฉลยเว้นวันที่ไว้ = บนใบอ่านวันที่ไม่ออกจริง (ซีด/เสียหาย) — ไม่นับคะแนนวันที่ของใบนี้
  const dateOk = t.date ? d.issued_at === t.date : null;
  if (dateOk === false)
    errors.push({ field: "วันที่", cause: classifyDate(t.date, d.issued_at, ocrText), truth: t.date, pred: d.issued_at ?? "-" });

  const merchantOk = t.merchant ? merchantMatches(t.merchant, d.merchant_name) : null;
  const merchantTypeOk = t.merchant_type ? d.merchant_type === appTypeOf(t.merchant_type) : null;

  const truthVat = money(t.vat);
  const predVat = money(d.vat_amount);
  const vatOk = scoreVat(truthVat, predVat);
  if (vatOk === false)
    errors.push({ field: "VAT", cause: classifyAmount(truthVat!, predVat, pool), truth: truthVat!, pred: predVat ?? "-" });

  // รายการสินค้า: จับคู่ยอดแบบ multiset (ลำดับไม่สำคัญ ยอดซ้ำนับตามจำนวนครั้ง)
  const truthItems = t.items ? t.items.split("|").map(money).filter((v): v is string => v !== null) : [];
  const predItems = d.line_items.map((i) => money(i.amount)).filter((v): v is string => v !== null);
  const left = [...predItems];
  const missing: string[] = [];
  for (const v of truthItems) {
    const i = left.indexOf(v);
    if (i >= 0) left.splice(i, 1);
    else missing.push(v);
  }
  const itemTp = truthItems.length - missing.length;
  // จับคู่ค่าที่อ่านผิดได้ครั้งเดียว — ค่าที่ถูกใช้อธิบายรายการหนึ่งแล้วไม่นับเป็น "เกิน" อีก
  const confusedUsed = new Set<number>();
  for (const v of missing) {
    const idx = left.findIndex((p, i) => !confusedUsed.has(i) && digitConfusion(v, p));
    const confused = idx >= 0 ? left[idx] : undefined;
    if (idx >= 0) confusedUsed.add(idx);
    errors.push({
      field: "รายการสินค้า (ขาด)",
      cause: confused ? "digit" : inOcr(v, pool) ? "aiDropped" : "ocrMissing",
      truth: v,
      pred: confused ?? "-",
    });
  }
  for (const [i, v] of left.entries()) {
    if (confusedUsed.has(i)) continue; // นับไปแล้วในฝั่ง "ขาด" (อ่านตัวเลขผิด)
    errors.push({
      field: "รายการสินค้า (เกิน)",
      cause: inOcr(v, pool) ? "aiExtra" : "hallucination",
      truth: "-",
      pred: v,
    });
  }

  const truthTextFile = path.join(ROOT, "truth-text", `${path.parse(t.file).name}.txt`);
  const cerValue = existsSync(truthTextFile) ? cer(readFileSync(truthTextFile, "utf8"), ocrText) : null;

  return {
    ...base,
    apiError: null,
    ocrMs,
    aiMs,
    ocrKb: Math.round(stored.length / 1024),
    cer: cerValue,
    totalOk,
    totalInOcr: inOcr(truthTotal, pool),
    dateOk,
    merchantOk,
    merchantTypeOk,
    vatOk,
    itemTp,
    itemFp: predItems.length - itemTp,
    itemFn: missing.length,
    pred: { total: predTotal, date: d.issued_at, merchant: d.merchant_name, vat: predVat },
    errors,
  };
}

// ------------------------------------------------------------------ สรุปเป็นตาราง

const pct = (num: number, den: number) => (den ? ((num / den) * 100).toFixed(1) : "-");
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const fixed = (v: number | null, dp = 1) => (v === null ? "-" : v.toFixed(dp));

function rate(rs: Result[], key: "totalOk" | "dateOk" | "merchantOk" | "merchantTypeOk" | "vatOk" | "totalInOcr") {
  const scored = rs.filter((r) => r[key] !== null);
  return { n: scored.length, ok: scored.filter((r) => r[key]).length };
}

function itemScores(rs: Result[]) {
  const tp = rs.reduce((s, r) => s + r.itemTp, 0);
  const fp = rs.reduce((s, r) => s + r.itemFp, 0);
  const fn = rs.reduce((s, r) => s + r.itemFn, 0);
  const p = tp + fp ? tp / (tp + fp) : 0;
  const r = tp + fn ? tp / (tp + fn) : 0;
  return { tp, fp, fn, p, r, f1: p + r ? (2 * p * r) / (p + r) : 0 };
}

function groupTable(rs: Result[], key: "merchantType" | "condition", label: string) {
  const groups = new Map<string, Result[]>();
  for (const r of rs) groups.set(r[key], [...(groups.get(r[key]) ?? []), r]);
  const rows: (string | number | null)[][] = [
    [label, "จำนวนใบ", "ยอดรวมถูก (%)", "วันที่ถูก (%)", "ชื่อร้านถูก (%)", "รายการสินค้า F1 (%)", "CER เฉลี่ย (%)"],
  ];
  for (const [g, list] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
    const name =
      key === "merchantType"
        ? (TRUTH_TYPE_LABEL[g] ?? MERCHANT_TYPES.find((m) => m.id === g)?.name ?? g)
        : g;
    const cers = list.map((r) => r.cer).filter((v): v is number => v !== null);
    rows.push([
      name,
      list.length,
      pct(rate(list, "totalOk").ok, rate(list, "totalOk").n),
      pct(rate(list, "dateOk").ok, rate(list, "dateOk").n),
      pct(rate(list, "merchantOk").ok, rate(list, "merchantOk").n),
      (itemScores(list).f1 * 100).toFixed(1),
      cers.length ? fixed(mean(cers)! * 100) : "-",
    ]);
  }
  return rows;
}

// ------------------------------------------------------------------ main

const truthFile = path.join(ROOT, "ground-truth.csv");
if (!existsSync(truthFile)) {
  console.error(
    `ไม่พบ ${truthFile}\nคัดลอก evaluation/ground-truth.example.csv เป็น ground-truth.csv แล้วกรอกเฉลยของรูปใน evaluation/images/`,
  );
  process.exit(1);
}
const truths = (parseCsv(readFileSync(truthFile, "utf8")) as Truth[])
  .filter((t) => t.file)
  .slice(0, limit);
const missingImages = truths.filter((t) => !existsSync(path.join(ROOT, "images", t.file)));
if (missingImages.length) {
  console.error("ไม่พบรูปใน evaluation/images/: " + missingImages.map((t) => t.file).join(", "));
  process.exit(1);
}
const badRows = truths.filter((t) => !money(t.total) || (t.date && !/^\d{4}-\d{2}-\d{2}$/.test(t.date)));
if (badRows.length) {
  console.error(
    "เฉลยต้องมี total เป็นตัวเลข และ date เป็น YYYY-MM-DD (หรือเว้นว่างถ้าบนใบอ่านวันที่ไม่ออก): " +
      badRows.map((t) => t.file).join(", "),
  );
  process.exit(1);
}
const unknownTypes = [
  ...new Set(truths.map((t) => t.merchant_type).filter((m) => m && !MERCHANT_TYPES.some((x) => x.id === appTypeOf(m)))),
];
if (unknownTypes.length) {
  console.log(`⚠️ ประเภทร้านในเฉลยที่แปลงเป็นของแอปไม่ได้ (นับว่าผิดเสมอ): ${unknownTypes.join(", ")} — เพิ่มใน TRUTH_TO_APP_TYPE`);
}
const noDate = truths.filter((t) => !t.date);
if (noDate.length) {
  console.log(`ℹ️ ไม่คิดคะแนนวันที่ของ ${noDate.length} ใบที่เฉลยเว้นวันที่ไว้: ${noDate.map((t) => t.file).join(", ")}`);
}

mkdirSync(path.join(RAW, "ocr"), { recursive: true });
const total = truths.length * sizes.length * runs;

// ผลที่ผ่านแล้วจากครั้งก่อน (เก็บทุกครั้งที่ประเมินเสร็จหนึ่งใบ) — --resume ข้ามตัวที่ผ่านแล้ว
const STATE = path.join(RAW, "results.json");
const inTruthFiles = new Set(truths.map((t) => t.file));
const keyOf = (r: { file: string; size: number; run: number }) => `${r.file}|${r.size}|${r.run}`;
// โหลดผลเดิมเสมอเพื่อไม่ให้ทับของที่สะสมไว้ — --resume แค่ตัดสินว่าจะข้ามตัวที่ผ่านแล้วไหม
// (ไม่ใส่ --resume = ประเมินใหม่ทุกตัวที่สั่ง แล้วเขียนทับเฉพาะ key เดียวกัน)
const store = new Map<string, Result>(
  (existsSync(STATE) ? (JSON.parse(readFileSync(STATE, "utf8")) as Result[]) : [])
    .filter((r) => !r.apiError)
    .map((r) => [keyOf(r), r]),
);
const saveState = () => writeFileSync(STATE, JSON.stringify([...store.values()]));
const todo = resume
  ? total -
    [...store.keys()].filter((k) => {
      const [file, size, run] = k.split("|");
      return inTruthFiles.has(file) && sizes.includes(Number(size)) && Number(run) <= runs;
    }).length
  : total;
console.log(
  `ประเมิน ${truths.length} ใบ × ${sizes.length} ขนาด × ${runs} รอบ = ${total} ครั้ง` +
    (resume ? ` (ผ่านแล้ว ${total - todo}, เหลือ ${todo})` : "") +
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
      const cached = resume ? store.get(keyOf({ file: t.file, size, run })) : undefined;
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
      if (streak >= MAX_CONSECUTIVE_API_ERRORS) {
        console.log(`\n⛔ API ล้มติดกัน ${streak} ครั้ง — หยุดก่อนเพื่อไม่ให้เปลืองโควตา`);
        console.log(`   ล่าสุด: ${r.apiError}`);
        console.log(`   รอสักพักแล้วรันคำสั่งเดิมต่อท้ายด้วย --resume ระบบจะประเมินต่อจากที่ค้างไว้`);
        aborted = true;
        break outer;
      }
      const mark = r.apiError ? `⚠️ API error: ${r.apiError.slice(0, 60)}` : `ยอดรวม ${r.totalOk ? "✓" : "✗"} วันที่ ${r.dateOk === null ? "-" : r.dateOk ? "✓" : "✗"} รายการ ${r.itemTp}/${r.itemTp + r.itemFn}`;
      console.log(`[${done}/${total}] รอบ ${run} ${size}px ${t.file} — ${mark}`);
      await sleep(500); // เว้นช่วงกันโดนจำกัดการเรียก
    }
  }
}

/**
 * ตารางคิดจากผลทั้งหมดที่สะสมไว้ (ทุกขนาดที่เคยรันผ่าน) ไม่ใช่แค่รอบนี้
 * จึงแบ่งรันทีละขนาดข้ามวันได้ (โควตา API รายวัน) แล้วตารางยังครบทุกขนาด
 * ใช้เฉพาะใบที่ยังอยู่ในเฉลยตอนนี้ — แถวที่ลบออกจากเฉลยแล้วจะไม่ถูกนับ
 */
const inTruth = new Set(truths.map((t) => t.file));
const truthByFile = new Map(truths.map((t) => [t.file, t]));
// ให้คะแนน VAT ใหม่ด้วยกติกาปัจจุบันจากค่าที่ AI ตอบซึ่งเก็บไว้แล้ว — ผลเก่าไม่ต้องเรียก API ซ้ำ
const cumulative = [...store.values()]
  .filter((r) => inTruth.has(r.file))
  .map((r) => {
    const vatOk = scoreVat(money(truthByFile.get(r.file)!.vat), r.pred.vat);
    return {
      ...r,
      vatOk,
      errors: vatOk === false ? r.errors : r.errors.filter((e) => e.field !== "VAT"),
    };
  });
const ok = cumulative.filter((r) => !r.apiError);
const ranSizes = [...new Set(ok.map((r) => r.size))].sort((a, b) => a - b);
/**
 * ตาราง 1, 2, 4 ใช้ขนาดที่แอปใช้จริงถ้ามีผลแล้ว ไม่งั้นใช้ขนาดใหญ่สุดที่มี
 * --table-size=N บังคับขนาดเอง (เช่นตอนขนาดใหญ่สุดยังรันไม่ครบทุกใบ)
 */
const tableSize = arg("table-size")
  ? Number(arg("table-size"))
  : ranSizes.includes(PRODUCTION_SIZE)
    ? PRODUCTION_SIZE
    : Math.max(...ranSizes, 0);
const main = ok.filter((r) => r.size === tableSize);
const apiErrors = results.filter((r) => r.apiError).length;

// raw: ทุกใบทุกขนาด
writeCsv(path.join(RAW, "per-receipt.csv"), [
  ["file", "run", "size_px", "merchant_type", "condition", "api_error", "ocr_ms", "ai_ms", "image_kb", "cer",
    "total_ok", "total_pred", "total_in_ocr", "date_ok", "date_pred", "merchant_ok", "merchant_pred",
    "merchant_type_ok", "vat_ok", "vat_pred", "item_tp", "item_fp", "item_fn", "errors"],
  ...cumulative.map((r) => [
    r.file, r.run, r.size, r.merchantType, r.condition, r.apiError, r.ocrMs, r.aiMs, r.ocrKb, r.cer === null ? null : r.cer.toFixed(4),
    String(r.totalOk), r.pred.total, String(r.totalInOcr), String(r.dateOk), r.pred.date, String(r.merchantOk), r.pred.merchant,
    String(r.merchantTypeOk), String(r.vatOk), r.pred.vat, r.itemTp, r.itemFp, r.itemFn,
    r.errors.map((e) => `${e.field}: ${e.truth}→${e.pred} [${CAUSES[e.cause]}]`).join(" ; "),
  ]),
]);

// ตาราง 1
const items = itemScores(main);
const cers = main.map((r) => r.cer).filter((v): v is number => v !== null);
const row1 = (name: string, k: Parameters<typeof rate>[1]) => {
  const { n, ok: c } = rate(main, k);
  return [name, n, c, pct(c, n)];
};
writeCsv(path.join(OUT, "table1-accuracy.csv"), [
  ["ตัวชี้วัด", "จำนวนที่ประเมิน", "ถูกต้อง", "ความแม่นยำ (%)"],
  row1("ยอดรวม (total)", "totalOk"),
  row1("วันที่ (date)", "dateOk"),
  row1("ชื่อร้าน (merchant)", "merchantOk"),
  row1("ประเภทร้าน (merchant type)", "merchantTypeOk"),
  row1("VAT", "vatOk"),
  row1("OCR อ่านยอดรวมได้ถูก (ก่อนผ่าน AI)", "totalInOcr"),
  ["รายการสินค้า — Precision", items.tp + items.fp, items.tp, (items.p * 100).toFixed(1)],
  ["รายการสินค้า — Recall", items.tp + items.fn, items.tp, (items.r * 100).toFixed(1)],
  ["รายการสินค้า — F1", "-", "-", (items.f1 * 100).toFixed(1)],
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

console.log(`\nเสร็จแล้ว — ตารางอยู่ใน ${path.relative(process.cwd(), OUT)}/ (ตาราง 1, 2, 4 ใช้ผลที่ ${tableSize}px)`);
if (apiErrors || aborted) {
  console.log(
    `⚠️ ยังประเมินไม่ครบ (API ไม่สำเร็จ ${apiErrors} ครั้ง${aborted ? ", หยุดกลางทาง" : ""}) — ` +
      `ตารางตอนนี้นับเฉพาะที่ผ่าน รันคำสั่งเดิมต่อท้ายด้วย --resume เพื่อเก็บส่วนที่เหลือ`,
  );
}
