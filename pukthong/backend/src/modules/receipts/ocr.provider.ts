/**
 * เรียก Google Cloud Vision อ่านตัวอักษรบนใบเสร็จ (DOCUMENT_TEXT_DETECTION)
 *
 * OCR ที่นี่ "ไม่ใช่" ตัวแยกโครงสร้าง — มันคืนแค่ข้อความกับความมั่นใจ ส่วนการตัดสินว่า
 * เลขไหนคือยอดรวม เลขไหนคือ VAT ยังเป็นหน้าที่ของ ai.provider เหมือนเดิม
 * ข้อความจากที่นี่ถูกส่งไปพร้อมรูปเพื่อให้โมเดลยึดตัวเลขตาม OCR แทนที่จะเดาจากพิกเซล
 *
 * ใช้ REST ตรงๆ ไม่ผ่าน @google-cloud/vision เพราะ SDK ต้องใช้ไฟล์ service account
 * ส่วนที่นี่ใช้ API key จาก .env ได้เลย — ตรงกับหลัก "อ่านค่าทั้งหมดจาก .env" ของโปรเจกต์
 *
 * ⚠️ กฎเหล็กของไฟล์นี้: ห้าม throw ให้ request ล้ม
 * OCR เป็นตัวช่วย ไม่ใช่ของจำเป็น — Vision ล่ม/โควตาหมด/key ผิด ต้องยังอัปโหลดใบเสร็จ
 * และกดปุ่ม ✨ ได้ตามปกติ (คืน null แล้วปล่อยให้ AI อ่านจากรูปอย่างเดียวเหมือนก่อนมี OCR)
 */
import { ocrLanguageHintList, settings } from "../../config/index.js";

/** timeout สั้นกว่า AI เพราะ OCR คั่นอยู่ระหว่างผู้ใช้กับหน้าจอ "อัปโหลดเสร็จ" */
const TIMEOUT_MS = 20_000;

export interface OcrResult {
  /** ข้อความทั้งใบตามลำดับที่ Vision อ่านได้ — null ถ้า OCR ใช้ไม่ได้หรือไม่เจอตัวอักษร */
  text: string | null;
  /** ความมั่นใจเฉลี่ย 0–1 — null ถ้าไม่รู้ (คนละความหมายกับ 0 ที่แปลว่ามั่นใจต่ำจริงๆ) */
  quality: number | null;
}

const EMPTY: OcrResult = { text: null, quality: null };

export const isEnabled = () => Boolean(settings.googleVisionApiKey);

/** ต่ำกว่าเกณฑ์ = เตือนผู้ใช้ว่าภาพอาจอ่านยาก — ไม่รู้คะแนนก็ไม่เตือน (เหมือน image.quality) */
export function isLowQuality(quality: number | null): boolean {
  if (quality === null) return false;
  return quality < settings.ocrQualityThreshold;
}

/**
 * ความมั่นใจเฉลี่ยถ่วงน้ำหนักด้วยจำนวนตัวอักษร
 *
 * ถ่วงน้ำหนักเพราะคำว่า "รวมทั้งสิ้น" กับ "฿" ไม่ควรมีน้ำหนักเท่ากันในการตัดสินว่า
 * ทั้งใบอ่านออกแค่ไหน — ไม่งั้นใบที่เต็มไปด้วยสัญลักษณ์สั้นๆ จะได้คะแนนเพี้ยน
 */
function meanConfidence(pages: unknown): number | null {
  if (!Array.isArray(pages)) return null;

  let weighted = 0;
  let chars = 0;

  for (const page of pages) {
    for (const block of arr(page, "blocks")) {
      for (const para of arr(block, "paragraphs")) {
        for (const word of arr(para, "words")) {
          const symbols = arr(word, "symbols");
          const conf = num((word as Record<string, unknown>)?.confidence);
          if (conf === null || symbols.length === 0) continue;
          weighted += conf * symbols.length;
          chars += symbols.length;
        }
      }
    }
  }

  return chars > 0 ? weighted / chars : null;
}

const arr = (obj: unknown, key: string): unknown[] => {
  const v = (obj as Record<string, unknown> | null | undefined)?.[key];
  return Array.isArray(v) ? v : [];
};

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/**
 * อ่านตัวอักษรจากรูป JPEG ที่ normalize แล้ว
 *
 * คืน { text: null } ทุกกรณีที่อ่านไม่ได้ — ผู้เรียกไม่ต้องดักอะไรเลย
 */
export async function readText(jpegBytes: Buffer): Promise<OcrResult> {
  if (!isEnabled()) return EMPTY;

  const body = {
    requests: [
      {
        image: { content: jpegBytes.toString("base64") },
        // DOCUMENT_TEXT_DETECTION ไม่ใช่ TEXT_DETECTION — ตัวนี้ออกแบบมาสำหรับเอกสาร
        // ที่มีบรรทัดหนาแน่น (ใบเสร็จ) และคืนโครงสร้าง block/paragraph/word มาให้ด้วย
        features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
        imageContext: { languageHints: ocrLanguageHintList },
      },
    ],
  };

  let res: Response;
  try {
    res = await fetch(
      `${settings.googleVisionUrl}?key=${encodeURIComponent(settings.googleVisionApiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
  } catch (err) {
    // เน็ตล่มหรือ timeout — บันทึกไว้ดูย้อนหลังได้ แต่ไม่ให้กระทบผู้ใช้
    console.warn("เรียก Cloud Vision ไม่สำเร็จ (ข้ามขั้น OCR)", err);
    return EMPTY;
  }

  if (!res.ok) {
    // key ผิด / โควตาหมด / Vision API ยังไม่ได้เปิดใน project — ต้องเห็นใน log
    // ไม่งั้นจะงงว่าทำไม OCR เงียบหายไปเฉยๆ
    console.warn(
      `Cloud Vision ตอบ HTTP ${res.status} (ข้ามขั้น OCR) — ` +
        `ตรวจ GOOGLE_VISION_API_KEY, การเปิดใช้ Vision API และโควตาใน GCP console`,
      await res.text().catch(() => ""),
    );
    return EMPTY;
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch (err) {
    console.warn("Cloud Vision ตอบกลับไม่ใช่ JSON (ข้ามขั้น OCR)", err);
    return EMPTY;
  }

  const first = arr(json, "responses")[0] as Record<string, unknown> | undefined;
  if (!first) return EMPTY;

  // Vision ตอบ 200 แต่ใส่ error รายรูปมาใน body ได้ (เช่นรูปเสีย)
  if (first.error) {
    console.warn("Cloud Vision อ่านรูปนี้ไม่ได้ (ข้ามขั้น OCR)", first.error);
    return EMPTY;
  }

  const full = first.fullTextAnnotation as Record<string, unknown> | undefined;
  const text = typeof full?.text === "string" ? full.text.trim() : "";
  // ไม่เจอตัวอักษรเลย = รูปไม่ใช่ใบเสร็จ หรือมืดเกินไป — ไม่ใช่ error แต่ก็ไม่มีอะไรให้ใช้
  if (!text) return EMPTY;

  return { text, quality: meanConfidence(full?.pages) };
}
