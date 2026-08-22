/** อ่านค่าทั้งหมดจาก .env — ห้าม hardcode key ที่ไหนในโค้ด */

const str = (k: string, fallback: string) => process.env[k]?.trim() || fallback;
const int = (k: string, fallback: number) => {
  const n = Number(process.env[k]);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};
const bool = (k: string, fallback: boolean) => {
  const v = process.env[k]?.trim().toLowerCase();
  return v === undefined || v === "" ? fallback : v === "true" || v === "1";
};
const flt = (k: string, fallback: number) => {
  const n = Number(process.env[k]);
  return Number.isFinite(n) ? n : fallback;
};

const DEFAULT_MONGO_URI =
  "mongodb://pukthong_admin:change_me_in_local_env@localhost:27017/pukthong?authSource=admin";

/**
 * ชื่อฐานข้อมูลอยู่ใน path ของ URI (…:27017/pukthong?authSource=admin) — ดึงออกมา
 * เองเพราะ driver ต้องรับชื่อนี้แยกตอนเรียก client.db()
 *
 * authSource เป็นแค่ที่เก็บ user ไม่ใช่ฐานข้อมูลที่จะเขียนข้อมูลลง — ห้ามเอามาใช้แทน
 */
function dbNameFromUri(uri: string, fallback: string): string {
  const path = uri.split("?")[0].split("/")[3];
  return path ? decodeURIComponent(path) : fallback;
}

export const settings = {
  // KKU IntelSphere
  kkuBaseUrl: str("KKU_BASE_URL", "https://gen.ai.kku.ac.th/api/v1"),
  kkuApiKey: str("KKU_API_KEY", ""),
  kkuVisionModel: str("KKU_VISION_MODEL", "gemini-2.5-flash"),

  // Google Cloud Vision (OCR) — ว่างไว้ = ปิด OCR ทั้งระบบ แอปยังทำงานได้ปกติ
  googleVisionApiKey: str("GOOGLE_VISION_API_KEY", ""),
  googleVisionUrl: str(
    "GOOGLE_VISION_URL",
    "https://vision.googleapis.com/v1/images:annotate",
  ),
  /** ใบเสร็จไทยมีอังกฤษปนเสมอ (ชื่อแบรนด์ เลขที่เอกสาร) — บอกใบ้ทั้งสองภาษา */
  ocrLanguageHints: str("OCR_LANGUAGE_HINTS", "th,en"),
  /** ต่ำกว่านี้ถือว่า OCR อ่านได้ไม่ดี — ใช้เตือนผู้ใช้ ไม่ได้ใช้บล็อกอะไร */
  ocrQualityThreshold: flt("OCR_QUALITY_THRESHOLD", 0.75),

  // Database (MongoDB)
  mongoUri: str("MONGODB_URI", DEFAULT_MONGO_URI),
  mongoDbName: str(
    "MONGODB_DB",
    dbNameFromUri(str("MONGODB_URI", DEFAULT_MONGO_URI), "pukthong"),
  ),

  // Auth (JWT)
  jwtSecret: str("JWT_SECRET", ""),
  jwtExpiresIn: str("JWT_EXPIRES_IN", "7d"),

  // App
  maxImageLongEdge: int("MAX_IMAGE_LONG_EDGE", 2000),
  blurThreshold: flt("BLUR_THRESHOLD", 100.0),
  maxUploadMb: int("MAX_UPLOAD_MB", 15),
  uploadDir: str("UPLOAD_DIR", "/data/uploads"),
  corsOrigins: str("CORS_ORIGINS", "http://localhost:3000"),
  /**
   * true = ยอมรับ origin จากเครื่องในวง LAN ทุกตัว (10.x / 172.16-31.x / 192.168.x)
   *
   * มีไว้เพื่อทดสอบจากมือถือ เพราะเราเตอร์แจก IP ใหม่ให้เครื่องเรื่อยๆ แล้วต้องมาไล่แก้
   * CORS_ORIGINS ทุกครั้ง — ห้ามเปิดตอนขึ้นเซิร์ฟเวอร์จริงที่ออกอินเทอร์เน็ต
   */
  corsAllowLan: bool("CORS_ALLOW_LAN", false),
  port: int("PORT", 8000),
};

/**
 * ห้ามมี secret สำรองในโค้ดเด็ดขาด — ถ้ามี ทุกเครื่องที่ลืมตั้ง .env จะใช้ค่าเดียวกัน
 * แปลว่าใครก็ปลอม token เข้าบัญชีคนอื่นได้ ล้มตั้งแต่บูตพร้อมบอกวิธีแก้ดีกว่า
 */
export function requireJwtSecret(): string {
  if (!settings.jwtSecret) {
    throw new Error(
      "ยังไม่ได้ตั้ง JWT_SECRET ใน .env — สุ่มค่าด้วย: openssl rand -hex 32",
    );
  }
  return settings.jwtSecret;
}

/**
 * origin ของเครื่องในวงแลน — ยอมรับทุกพอร์ตเพราะ vite อาจเด้งพอร์ตเวลาชนกัน
 * (ครอบคลุมช่วง private ตาม RFC1918 เท่านั้น ไม่รวม IP สาธารณะ)
 */
export const LAN_ORIGIN_RE =
  /^https?:\/\/(?:localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(?::\d+)?$/;

export const corsOriginList = settings.corsOrigins
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

export const maxUploadBytes = settings.maxUploadMb * 1024 * 1024;

export const ocrLanguageHintList = settings.ocrLanguageHints
  .split(",")
  .map((l) => l.trim())
  .filter(Boolean);
