/**
 * เรียก KKU IntelSphere (OpenAI-compatible) ให้อ่านใบเสร็จ
 *
 * API key อ่านจาก .env เท่านั้น และไม่มีทางถูกส่งออกไปหา frontend
 * ถ้าโมเดลที่ตั้งไว้ไม่รับ image_url ให้เปลี่ยน KKU_VISION_MODEL ใน .env — อย่าแก้ไฟล์นี้
 */
import OpenAI from "openai";
import sharp from "sharp";

import { settings } from "../../config/index.js";
import { policyTypePrompt } from "../../shared/insurance.js";
import { merchantTypePrompt } from "../../shared/merchant-types.js";

/**
 * prompt หลัก — รับรายชื่อหมวดเข้ามา เพราะแต่ละคนมีหมวดที่สร้างเองไม่เหมือนกัน
 * AI ต้องเห็นหมวดของผู้ใช้คนนั้นด้วย ไม่งั้นหมวดที่สร้างเองจะไม่มีวันถูกเลือก
 */
export const systemPrompt = (categoryList: string) => `คุณคือระบบดึงข้อมูลจากใบเสร็จ ใบกำกับภาษี และสลิปโอนเงินของไทย
ตอบกลับเป็น JSON ที่ parse ได้เท่านั้น ห้ามมี markdown fence หรือคำอธิบายใดๆ

กฎเหล็ก:
- ห้ามเดา ถ้าอ่านฟิลด์ไหนไม่ออกให้ใส่ null และลดค่า confidence ของฟิลด์นั้น
- ตัวเลขทุกค่าให้คงตามที่พิมพ์บนใบเสร็จ ห้ามคำนวณหรือปัดเศษเอง (ยกเว้น amount ของรายการที่มีส่วนลด ดูกฎส่วนลดด้านล่าง)
- วันที่: ถ้าปีเป็น พ.ศ. (มากกว่า 2400 หรือเลข 2 หลักที่ตีความเป็น พ.ศ. ได้) ให้แปลงเป็น ค.ศ. โดยลบ 543 แล้วส่งรูปแบบ YYYY-MM-DD
- ถ้ามีเลขอ้างอิงที่ขึ้นต้นด้วยวันที่แบบ ค.ศ. (เช่น TID) ให้ใช้ไขว้ตรวจสอบวันที่ที่แปลงมา
- document_type เลือกจาก: TAX_INVOICE_FULL | TAX_INVOICE_ABB | RECEIPT | TRANSFER_SLIP | NOT_RECEIPT | OTHER
  TRANSFER_SLIP = สลิปโอนเงิน/หลักฐานการโอนจากแอปธนาคารหรือพร้อมเพย์ (ไม่ใช่ใบเสร็จของร้าน)
  NOT_RECEIPT = รูปที่ไม่ใช่เอกสารการซื้อขายเลย เช่น รูปคน อาหาร วิว หน้าจอแอปอื่น
- merchant_type: ประเภทของ "ร้าน" ที่ออกใบนี้ (ทั้งใบ ไม่ใช่รายชิ้น) ตอบเป็น id จากรายการนี้เท่านั้น
  ${merchantTypePrompt()}
  ดูจากชื่อร้านเป็นหลัก ไม่ใช่สินค้าที่ซื้อ — ซื้อปากกาที่ 7-Eleven ก็ยังเป็น convenience
- insurance: ถ้าเป็นใบเสร็จค่าเบี้ยประกัน (merchant_type = insurance) ให้กรอก object นี้ และส่ง line_items เป็น []
  เพราะใบประกันไม่มีรายการสินค้า — ใบประเภทอื่นให้ส่ง insurance เป็น null
  รูปแบบ: {"insurer": "...", "policy_number": "...", "policy_type": "life", "insured_name": "...", "coverage_start": "YYYY-MM-DD", "coverage_end": "YYYY-MM-DD", "premium": 0}
  policy_type เลือกจาก: ${policyTypePrompt()}
  premium = จำนวนเบี้ยประกันที่ชำระในใบนี้, coverage_start/coverage_end = ระยะเวลาคุ้มครองแบบ YYYY-MM-DD (แปลง พ.ศ. เป็น ค.ศ.)
- handwritten: true ถ้ารายการสินค้าหรือยอดเงินบนใบ "เขียนด้วยลายมือ" เช่น บิลเงินสดที่ร้านเขียนด้วยปากกา
  ใบที่พิมพ์จากเครื่องแต่มีแค่ลายเซ็น ตราประทับ หรือเลขจดเพิ่มด้วยมือ ให้ตอบ false
- ถ้าราคามีตัวอักษรกำกับต่อท้าย (เช่น N) ให้เก็บไว้ในฟิลด์ flag ของรายการนั้น ห้ามตัดทิ้ง
- category_guess: จัดหมวดค่าใช้จ่ายให้ของ "ทุกชิ้น" โดยเลือกจากรายการนี้เท่านั้น ห้ามคิดชื่อหมวดขึ้นมาเอง
  ${categoryList}
  หมวดที่เขียนแบบ "หลัก > ย่อย" ให้ตอบเฉพาะชื่อหมวดย่อย และเลือกหมวดย่อยเมื่อเข้ากับสินค้าชัดเจน
  ดูจากตัวสินค้าเป็นหลัก ไม่ใช่ประเภทร้าน — ซื้อแชมพูจากร้านสะดวกซื้อคือ "ของใช้ส่วนตัว" ไม่ใช่ "อาหาร"
  ตัวอย่าง: นม/ขนมปัง/ข้าวกล่อง -> อาหาร | น้ำเปล่า/กาแฟ/น้ำอัดลม -> เครื่องดื่ม
  น้ำยาล้างจาน/ทิชชู่/ถุงขยะ -> ของใช้ในบ้าน | ยาสีฟัน/แชมพู/ผ้าอนามัย -> ของใช้ส่วนตัว
  ลิปสติก/รองพื้น/ครีมกันแดด/สกินแคร์/น้ำหอม -> ความงามและของใช้ส่วนตัว
  ยา/วิตามิน/อาหารเสริม/หน้ากากอนามัย/พลาสเตอร์ -> สุขภาพและยา | น้ำมัน/ค่าโดยสาร/ค่าทางด่วน -> การเดินทาง
  ถ้าอ่านชื่อสินค้าไม่ออกหรือจัดหมวดไม่ได้จริงๆ ให้ใส่ "อื่นๆ" (ห้ามใส่ null ถ้ายังพออนุมานได้)
- ส่วนลดรายสินค้า: บรรทัดส่วนลดที่อยู่ใต้หรือติดกับสินค้า (เช่น "ส่วนลด", "-26.54", "โปร 2 ชิ้น", "Member Disc", เปอร์เซ็นต์ลด)
  ให้รวมเข้ากับสินค้าชิ้นนั้น ห้ามแยกเป็นรายการติดลบ
  gross_amount = ราคาก่อนลดของบรรทัดนั้นตามที่พิมพ์ | discount = ส่วนลดของสินค้านั้นเป็นจำนวนบวก (ไม่มีให้ใส่ null)
  discount_label = ข้อความของบรรทัดส่วนลดตามที่พิมพ์ เช่น "HairJew 20.57%", "โปร 2 ชิ้น 99" (ไม่มีให้ใส่ null)
  amount = ราคาสุทธิหลังหักส่วนลด = gross_amount − discount (ไม่มีส่วนลด amount = gross_amount)
  ตัวอย่าง: "CS Bracelet 129.00" ตามด้วย "HairJew 20.57% -26.54" -> gross_amount 129.00, discount 26.54, amount 102.46
- bill_discounts: ส่วนลดท้ายบิลที่ไม่ได้ผูกกับสินค้าชิ้นใด แยกเป็นก้อนตามที่พิมพ์ แต่ละก้อนคือ
  {"label": "ข้อความตามที่พิมพ์", "kind": "discount|member|coupon|points", "amount": จำนวนเงินที่ลด (บวก), "points_used": จำนวนคะแนนที่ใช้ หรือ null}
  kind: discount = ส่วนลดท้ายบิลทั่วไป | member = ส่วนลดสมาชิก | coupon = คูปอง/โค้ด/voucher
        points = ใช้คะแนน/แต้ม/สแตมป์แลกส่วนลด (เช่น The 1, Big Point, ALL Member, M-Stamp, คะแนนสะสม)
  ห้ามใส่บรรทัดส่วนลด คูปอง หรือการใช้คะแนนเป็น line_items เด็ดขาด แม้ยอดจะเป็น 0.00
  คะแนนที่ "ได้รับ" หรือ "คงเหลือ" ไม่ใช่ส่วนลด ห้ามใส่
  ห้ามนับส่วนลดรายสินค้าซ้ำ — บรรทัดสรุปท้ายใบ (เช่น "Customer Discount", "รวมส่วนลด", "You saved")
  ที่เป็นผลรวมของส่วนลดรายสินค้าที่ใส่ไปแล้ว ไม่ใช่ส่วนลดท้ายบิล ไม่ต้องใส่
- discount (ระดับใบ) = ผลรวม amount ของ bill_discounts (ไม่มีให้ใส่ null)
  subtotal = ยอดก่อนส่วนลดท้ายบิลตามที่พิมพ์ ถ้าไม่ได้พิมพ์ให้ใส่ null
- line_items: ถ้าอ่านได้แค่บางบรรทัด ให้ส่งเฉพาะบรรทัดที่มั่นใจ แล้วตั้ง line_items_complete = false ห้ามแต่งบรรทัดที่อ่านไม่ออกขึ้นมาเอง
- raw_text: ถอดข้อความทั้งหมดที่เห็นตามลำดับบนใบเสมอ แม้จะจัดโครงสร้างไม่ได้ (ถ้ามีข้อความจาก OCR ให้ส่ง null ระบบจะใช้ของ OCR แทน)
- unreadable_regions: อธิบายสั้นๆ ว่าส่วนไหนอ่านไม่ออก
- ข้อมูลส่วนบุคคล (ชื่อลูกค้า เลขสมาชิก) ให้ใส่ใน customer แยกไว้ ระบบจะเป็นผู้ตัดสินใจว่าจะเก็บหรือไม่
- ถ้าผู้ใช้แนบ "ข้อความจาก OCR" มาด้วย ให้ถือว่าตัวอักษรและตัวเลขใน OCR ถูกต้องกว่าที่คุณอ่านจากรูปเอง
  ใช้รูปเพื่อดูโครงสร้าง (คอลัมน์ไหนคือราคา บรรทัดไหนคือยอดรวม รายการสินค้าเรียงยังไง)
  แต่ "ค่าของตัวเลข" ให้คัดจาก OCR เป็นหลัก ห้ามแก้ตัวเลขที่ OCR อ่านได้ให้เป็นค่าอื่นเพราะคิดว่าน่าจะเป็นแบบนั้น
  ถ้า OCR กับรูปขัดแย้งกันจนตัดสินไม่ได้ ให้ใส่ค่าที่เห็นในรูป แล้วเพิ่ม warning บอกว่าฟิลด์ไหนขัดแย้ง
- warnings และ unreadable_regions ต้องเขียนเป็น "ภาษาไทย" เสมอ เพราะข้อความสองฟิลด์นี้ถูกแสดงให้ผู้ใช้อ่านโดยตรง
  ส่วนฟิลด์อื่นให้คงข้อความตามที่พิมพ์บนใบเสร็จ (ถ้าบนใบเป็นภาษาอังกฤษก็ส่งภาษาอังกฤษ ห้ามแปล)

โครงสร้าง JSON ที่ต้องส่งกลับ:
{
  "document_type": "...",
  "handwritten": false,
  "merchant_name": "...",
  "merchant_type": "convenience",
  "branch": "...",
  "merchant_tax_id": "...",
  "doc_number": "...",
  "issued_at": "YYYY-MM-DD",
  "issued_time": "HH:MM",
  "currency": "THB",
  "line_items": [
    {"qty": 0, "name": "...", "unit_price": 0, "gross_amount": 0, "discount": null, "discount_label": null, "amount": 0, "flag": null, "category_guess": "เลือกจากรายการที่กำหนด"}
  ],
  "line_items_complete": true,
  "item_count_printed": 0,
  "subtotal": 0,
  "discount": null,
  "bill_discounts": [],
  "service_charge": 0,
  "vat_rate": 7,
  "vat_amount": 0,
  "vat_included": true,
  "total": 0,
  "payment_method": "cash|card|promptpay|transfer|ewallet",
  "payment_channel": "...",
  "customer": {"name": null, "member_no": null},
  "confidence": {"total": 0.0, "issued_at": 0.0, "merchant_name": 0.0, "line_items": 0.0},
  "warnings": ["..."],
  "unreadable_regions": ["..."],
  "raw_text": "...",
  "insurance": null,
  "extra": {}
}`;

export const USER_PROMPT = `อ่านใบเสร็จในรูปนี้แล้วส่งข้อมูลกลับตามโครงสร้าง JSON ที่กำหนดในระบบ
ให้ความสำคัญกับ total และ issued_at เป็นอันดับแรก`;

/**
 * ข้อความ OCR ถูกส่งเป็น text part แยกต่อจากรูป
 *
 * คั่นด้วยเส้นให้ชัดเพื่อไม่ให้โมเดลเข้าใจผิดว่าเป็นคำสั่ง — ทั้งก้อนคือ "ข้อมูล"
 * ที่ถอดมาจากรูปเดียวกัน ไม่ใช่ instruction ใหม่
 */
export const ocrPrompt = (ocrText: string) =>
  `ข้อความจาก OCR ของใบเสร็จใบเดียวกันนี้ (ตัวอักษรและตัวเลขในนี้ถูกต้องกว่าที่อ่านจากรูป):
--- เริ่มข้อความ OCR ---
${ocrText}
--- จบข้อความ OCR ---`;

/**
 * เพดานขนาดรูปที่ส่งให้ AI — nginx ของ KKU ตอบ 413 เมื่อ body เกินราว 1MB
 * (รูป 866KB กลายเป็น base64 ~1.15MB แล้วโดนปฏิเสธ) จึงคุมไว้ที่ 600KB ก่อนแปลง base64
 */
const AI_MAX_BYTES = 600 * 1024;

/**
 * ย่อรูปเฉพาะที่ส่งให้ AI — รูปที่เก็บและที่ส่ง OCR ยังเป็นความละเอียดเต็ม
 *
 * AI ใช้รูปดูแค่โครงสร้าง (บรรทัดไหนคือยอดรวม) ค่าตัวเลขเอาจาก OCR อยู่แล้ว
 * จึงลดความละเอียดได้โดยไม่เสียความแม่นยำของตัวเลข
 */
async function shrinkForAi(jpegBytes: Buffer): Promise<Buffer> {
  if (jpegBytes.length <= AI_MAX_BYTES) return jpegBytes;
  let out = jpegBytes;
  for (const side of [1600, 1280, 1024]) {
    out = await sharp(jpegBytes)
      .resize({ width: side, height: side, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
    if (out.length <= AI_MAX_BYTES) break;
  }
  return out;
}

/** เรียก API ไม่สำเร็จ (key ผิด เน็ตล่ม โมเดลไม่รับรูป) — ข้อความเป็นภาษาไทย */
export class AIUnavailable extends Error {}

function client(): OpenAI {
  if (!settings.kkuApiKey) {
    throw new AIUnavailable("ยังไม่ได้ตั้งค่า KKU_API_KEY ใน .env");
  }
  return new OpenAI({
    baseURL: settings.kkuBaseUrl,
    apiKey: settings.kkuApiKey,
    timeout: 60_000,
    maxRetries: 2,
  });
}

/**
 * ดึง JSON ออกจากคำตอบของโมเดลแบบทนทาน:
 * รับได้ทั้ง JSON เปล่า, ห่อด้วย ```json fence, หรือมีข้อความนำหน้า/ตามหลัง
 * คืน null ถ้าดึงไม่ได้จริงๆ (ให้ผู้เรียกไปกรอกมือต่อ ไม่ใช่โยน 500)
 */
export function parseJsonLoose(text: string | null | undefined): Record<string, unknown> | null {
  if (!text) return null;

  let cleaned = text.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(cleaned);
  if (fence) cleaned = fence[1].trim();

  const asObject = (s: string): Record<string, unknown> | null => {
    try {
      const data: unknown = JSON.parse(s);
      return data !== null && typeof data === "object" && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  };

  const direct = asObject(cleaned);
  if (direct) return direct;

  // fallback: คว้าบล็อก {...} ตัวนอกสุดด้วยการนับวงเล็บ
  const start = cleaned.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let escaped = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return asObject(cleaned.slice(start, i + 1));
    }
  }
  return null;
}

/**
 * ส่งรูปไปให้โมเดลอ่าน คืน { payload, model }
 *
 * - payload เป็น null = โมเดลตอบมาแต่ parse ไม่ได้ -> ผู้เรียกควรคืน draft เปล่า + warning
 * - เรียก API ไม่สำเร็จ -> throw AIUnavailable
 */
export async function extractReceipt(
  jpegBytes: Buffer,
  ocrText: string | null = null,
  categoryList = "",
): Promise<{ payload: Record<string, unknown> | null; model: string }> {
  const model = settings.kkuVisionModel;
  const b64 = (await shrinkForAi(jpegBytes)).toString("base64");

  let resp;
  try {
    resp = await client().chat.completions.create({
      model,
      temperature: 0,
      stream: false,
      messages: [
        { role: "system", content: systemPrompt(categoryList) },
        {
          role: "user",
          content: [
            { type: "text", text: USER_PROMPT },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } },
            // วางไว้ "หลัง" รูป เพื่อให้โมเดลดูโครงสร้างจากรูปก่อน แล้วค่อยเอา OCR ไปทาบ
            ...(ocrText ? [{ type: "text" as const, text: ocrPrompt(ocrText) }] : []),
          ],
        },
      ],
    });
  } catch (err) {
    if (err instanceof AIUnavailable) throw err;
    const name = err instanceof Error ? err.constructor.name : "Error";
    console.error("เรียก KKU vision ไม่สำเร็จ", err);
    throw new AIUnavailable(
      `เรียก AI ไม่สำเร็จ (${name}) — ` +
        `ตรวจ KKU_API_KEY และดูว่าโมเดล '${model}' รับรูปภาพได้จริงหรือไม่`,
      { cause: err },
    );
  }

  if (!resp.choices?.length) {
    throw new AIUnavailable("AI ไม่ได้ตอบกลับมา ลองใหม่อีกครั้ง");
  }

  return { payload: parseJsonLoose(resp.choices[0].message?.content), model };
}

/**
 * จัดประเภทร้านจาก "ชื่อร้าน" อย่างเดียว (ไม่ส่งรูป) — ใช้กับใบเก่าที่บันทึกไว้ก่อนมี
 * merchant_type ส่งทีละหลายชื่อในคำขอเดียวเพื่อประหยัดการเรียก API
 *
 * คืน { ชื่อร้าน: id } — ชื่อที่ AI ตอบนอกรายการจะไม่อยู่ในผลลัพธ์ ผู้เรียกตัดสินใจเอง
 */
export async function classifyMerchants(names: string[]): Promise<Record<string, string>> {
  if (names.length === 0) return {};
  const resp = await client().chat.completions.create({
    model: settings.kkuVisionModel,
    temperature: 0,
    stream: false,
    messages: [
      {
        role: "system",
        content:
          "จัดประเภทร้านค้าไทยจากชื่อร้าน ตอบเป็น JSON object เท่านั้น ห้ามมีคำอธิบาย " +
          'รูปแบบ {"<ชื่อร้านตามที่ให้มาเป๊ะๆ>": "<id>"} โดย id เลือกจากรายการนี้เท่านั้น:\n  ' +
          merchantTypePrompt(),
      },
      { role: "user", content: JSON.stringify(names) },
    ],
  });
  const parsed = parseJsonLoose(resp.choices[0]?.message?.content) ?? {};
  return Object.fromEntries(
    Object.entries(parsed).filter((e): e is [string, string] => typeof e[1] === "string"),
  );
}
