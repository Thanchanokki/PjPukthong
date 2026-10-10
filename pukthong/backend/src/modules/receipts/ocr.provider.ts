/**
 * เรียก Typhoon แบบ OpenAI-compatible ให้อ่านตัวอักษรบนใบเสร็จ
 *
 * OCR ที่นี่ "ไม่ใช่" ตัวแยกโครงสร้าง — มันคืนแค่ข้อความกับความมั่นใจ ส่วนการตัดสินว่า
 * เลขไหนคือยอดรวม เลขไหนคือ VAT ยังเป็นหน้าที่ของ ai.provider เหมือนเดิม
 * ข้อความจากที่นี่ถูกส่งไปพร้อมรูปเพื่อให้โมเดลยึดตัวเลขตาม OCR แทนที่จะเดาจากพิกเซล
 *
 * ส่งภาพ JPEG เป็น data URL ผ่าน chat completions และรับข้อความถอดตามลำดับกลับมา
 *
 * ⚠️ กฎเหล็กของไฟล์นี้: ห้าม throw ให้ request ล้ม
 * OCR เป็นตัวช่วย ไม่ใช่ของจำเป็น — Vision ล่ม/โควตาหมด/key ผิด ต้องยังอัปโหลดใบเสร็จ
 * และกดปุ่ม ✨ ได้ตามปกติ (คืน null แล้วปล่อยให้ AI อ่านจากรูปอย่างเดียวเหมือนก่อนมี OCR)
 */
import OpenAI from "openai";
import sharp from "sharp";

import { settings } from "../../config/index.js";

/** timeout สั้นกว่า AI เพราะ OCR คั่นอยู่ระหว่างผู้ใช้กับหน้าจอ "อัปโหลดเสร็จ" */
const TIMEOUT_MS = 20_000;

/**
 * ด้านยาวสุดของรูปที่ส่งให้ OCR — รูปจาก iPhone เต็มขนาดใหญ่หลาย MB จน Typhoon ตอบ 400
 * 1600px ยังอ่านตัวอักษรเล็กบนใบเสร็จได้ชัด (ทดสอบกับใบ H&M แล้ว)
 */
const OCR_MAX_SIDE = 1600;

/**
 * prompt มาตรฐานของ Typhoon OCR
 *
 * โมเดล typhoon-ocr เป็นโมเดลเฉพาะทาง ทำงานถูกต้องเฉพาะกับ prompt ที่ถูกฝึกมาเท่านั้น
 * ถ้าใช้ prompt อื่น (เช่นคำสั่งภาษาไทยที่เขียนเอง) มันจะพ่น prompt นี้กลับมาแทนข้อความบนใบเสร็จ
 * ห้ามแก้ข้อความข้างในนี้ และต้องส่งใน message role "user" คู่กับรูป ไม่ใช่ใน "system"
 */
const TYPHOON_OCR_PROMPT = `Extract all text from the image.

Instructions:
- Only return the clean Markdown.
- Do not include any explanation or extra text.
- You must include all information on the page.

Formatting Rules:
- Tables: Render tables using <table>...</table> in clean HTML format.
- Equations: Render equations using LaTeX syntax with inline ($...$) and block ($$...$$).
- Images/Charts/Diagrams: Wrap any clearly defined visual areas (e.g. charts, diagrams, pictures) in:

<figure>
Describe the image's main elements (people, objects, text), note any contextual clues (place, event, culture), mention visible text and its meaning, provide deeper analysis when relevant (especially for financial charts, graphs, or documents), comment on style or architecture if relevant, then give a concise overall summary. Describe in Thai.
</figure>

- Page Numbers: Wrap page numbers in <page_number>...</page_number> (e.g., <page_number>14</page_number>).
- Checkboxes: Use ☐ for unchecked and ☑ for checked boxes.`;

/** ข้อความต้นของ prompt — ถ้าคำตอบขึ้นต้นแบบนี้ แปลว่าโมเดลงงและพ่น prompt กลับมา */
const PROMPT_ECHO_PREFIX = "Extract all text from the image";

export interface OcrResult {
  /** ข้อความทั้งใบตามลำดับที่ Vision อ่านได้ — null ถ้า OCR ใช้ไม่ได้หรือไม่เจอตัวอักษร */
  text: string | null;
  /** ความมั่นใจเฉลี่ย 0–1 — null ถ้าไม่รู้ (คนละความหมายกับ 0 ที่แปลว่ามั่นใจต่ำจริงๆ) */
  quality: number | null;
}

const EMPTY: OcrResult = { text: null, quality: null };

export const isEnabled = () => Boolean(settings.typhoonOcrApiKey);

/** ต่ำกว่าเกณฑ์ = เตือนผู้ใช้ว่าภาพอาจอ่านยาก — ไม่รู้คะแนนก็ไม่เตือน (เหมือน image.quality) */
export function isLowQuality(quality: number | null): boolean {
  if (quality === null) return false;
  return quality < settings.ocrQualityThreshold;
}

const client = () =>
  new OpenAI({
    apiKey: settings.typhoonOcrApiKey,
    baseURL: settings.typhoonOcrBaseUrl,
    timeout: TIMEOUT_MS,
    maxRetries: 0,
  });

/**
 * อ่านตัวอักษรจากรูป JPEG ที่ normalize แล้ว
 *
 * คืน { text: null } ทุกกรณีที่อ่านไม่ได้ — ผู้เรียกไม่ต้องดักอะไรเลย
 */
export async function readText(jpegBytes: Buffer): Promise<OcrResult> {
  if (!isEnabled()) return EMPTY;

  try {
    // ย่อเฉพาะรูปที่ส่ง OCR — ไม่แตะรูปต้นฉบับที่เก็บไว้หรือที่ส่งให้ AI
    const small = await sharp(jpegBytes)
      .resize({ width: OCR_MAX_SIDE, height: OCR_MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    const image = `data:image/jpeg;base64,${small.toString("base64")}`;

    const response = await client().chat.completions.create({
      model: settings.typhoonOcrModel,
      // เอกสารของ Typhoon แนะนำไม่ให้ใช้ temperature สูงกับโมเดล OCR
      temperature: 0.1,
      stream: false,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: TYPHOON_OCR_PROMPT },
            { type: "image_url", image_url: { url: image } },
          ],
        },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim() ?? "";

    // กันโมเดลพ่น prompt กลับมา — ถ้าเก็บไว้จะกลายเป็น "ข้อความ OCR" ปลอมใน DB
    // และ ensureOcr จะใช้ของปลอมนี้ตลอดไปโดยไม่เรียก OCR ใหม่
    if (text.startsWith(PROMPT_ECHO_PREFIX)) {
      console.warn("Typhoon OCR คืน prompt กลับมาแทนข้อความ (ข้ามขั้น OCR) — เช็กชื่อโมเดลใน TYPHOON_OCR_MODEL");
      return EMPTY;
    }

    if (!text) {
      console.warn("Typhoon OCR ไม่พบตัวอักษรในภาพ (ข้ามขั้น OCR)");
      return EMPTY;
    }

    console.log(`✅ Typhoon OCR สำเร็จ: อ่านได้ ${text.length} ตัวอักษร`);
    return { text, quality: null };
  } catch (err) {
    // OCR เป็นตัวช่วย — API ล่ม/key ผิด/โมเดลไม่รับภาพ ต้องไม่ทำให้การอัปโหลดล้ม
    const reason = err instanceof Error ? err.message : String(err);
    const sizeKb = Math.round(jpegBytes.length / 1024);
    console.warn(
      `เรียก Typhoon OCR ไม่สำเร็จ (ข้ามขั้น OCR): ${reason} ` +
        `[model=${settings.typhoonOcrModel}, รูปต้นฉบับ ${sizeKb} KB]`,
    );
    return EMPTY;
  }
}