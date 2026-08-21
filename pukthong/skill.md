Build Prompt — แอปบันทึกรายรับรายจ่ายจากใบเสร็จ (OCR-first + AI fallback)

วางข้อความทั้งไฟล์นี้ให้ AI coding agent (เช่น Claude Code) เพื่อสร้างโปรเจกต์เริ่มต้น แก้ค่าในหัวข้อ "ค่าที่ต้องกรอกเอง" ก่อนรัน

เป้าหมาย

สร้างเว็บแอปบันทึกรายรับรายจ่ายส่วนตัว ผู้ใช้ถ่ายรูปใบเสร็จ ระบบพยายามอ่านข้อมูลด้วย OCR ในเครื่องก่อน (ประหยัดและเร็ว) ถ้าผลลัพธ์ไม่น่าพอใจ ผู้ใช้กดปุ่มเดียวเพื่อส่งรูปไปให้ AI (KKU IntelSphere) อ่านแบบเข้าใจโครงสร้าง แล้วนำผลมากรอกฟอร์มให้ยืนยันก่อนบันทึกลงฐานข้อมูล

หลักการสำคัญที่ห้ามพลาด

ผู้ใช้ต้องยืนยันข้อมูลเสมอก่อนบันทึกจริง ห้ามบันทึกอัตโนมัติ
ระบบต้องใช้งานได้แม้ OCR/AI อ่านได้ไม่ครบ (กรอกมือเติมได้)
เงินใช้ชนิดข้อมูลทศนิยมแม่นยำ (Decimal / NUMERIC) ห้ามใช้ float
API key ทั้งหมดอยู่ใน .env เท่านั้น ห้าม hardcode ห้าม commit และ frontend ห้ามถือ key เด็ดขาด — ต้องยิงผ่าน backend ของเราเสมอ
Tech stack
Backend: Python 3.12 + FastAPI + Pydantic v2
ORM/migration: SQLAlchemy 2.0 + Alembic
ฐานข้อมูล: PostgreSQL 17 (รันบน Docker)
OCR ในเครื่อง: Tesseract (ผ่าน pytesseract) + ภาษา tha และ eng
ปรับรูปก่อนอ่าน: OpenCV + Pillow
AI fallback: KKU IntelSphere API (OpenAI-compatible) เรียกผ่าน openai SDK ของ Python
Frontend: React + Vite + TypeScript + Tailwind + TanStack Query
มือถือ: ทำเป็น PWA ใช้ <input type="file" accept="image/*" capture="environment"> เรียกกล้อง
ค่าที่ต้องกรอกเอง (.env)

สร้างไฟล์ .env ที่ backend และ .env.example ที่ commit ได้ (ค่าว่าง)

dotenv
# ===== KKU IntelSphere (OpenAI-compatible) =====
KKU_BASE_URL=https://gen.ai.kku.ac.th/api/v1
KKU_API_KEY=sk_UACuvNX...ใส่ key จริงตรงนี้...
# โมเดลข้อความ (สำหรับงานที่ไม่ต้องดูรูป)
KKU_TEXT_MODEL=gemini-2.5-flash-lite
# โมเดลที่รับรูปภาพได้ — ต้องทดสอบว่า endpoint ปล่อยตัวไหนที่รับ image_url
# ถ้า gemini-2.5-flash-lite ไม่รับรูป ให้ลอง gemini-2.5-flash หรือ gemini-2.5-pro
KKU_VISION_MODEL=gemini-2.5-flash

# ===== Database =====
DATABASE_URL=postgresql+psycopg://postgres:postgres@db:5432/expense

# ===== App =====
MAX_IMAGE_LONG_EDGE=2000        # ย่อด้านยาวก่อนส่ง AI
BLUR_THRESHOLD=100.0            # ค่า variance of Laplacian ต่ำกว่านี้ถือว่าเบลอ

สำคัญ: ใส่ .env ไว้ใน .gitignore และ mount เข้า container ผ่าน env_file ใน docker-compose อย่าเขียน key ลงในโค้ด

Flow การทำงาน (หัวใจของแอป)
ผู้ใช้ถ่าย/เลือกรูป
      │
      ▼
[1] Frontend ครอปใบเสร็จ + เช็คเบลอ (เตือนถ้าเบลอ ให้ถ่ายใหม่ได้)
      │  ส่งรูปมาที่ backend
      ▼
[2] Backend: OCR ในเครื่องด้วย Tesseract (เร็ว ฟรี)
      │  พยายาม parse เป็นฟิลด์เบื้องต้น + คำนวณ "คะแนนความมั่นใจ"
      ▼
[3] Frontend แสดงผล OCR ในฟอร์ม พร้อมแบนเนอร์บอกคุณภาพ:
      ├─ ถ้าอ่านได้ครบ/มั่นใจ → ผู้ใช้ตรวจแล้วกดบันทึก
      └─ ถ้าไม่พอใจ → มีปุ่มเด่น [ ✨ ให้ AI อ่านให้ ]
                          │
                          ▼
[4] Backend ส่งรูปไป KKU Vision API → ได้ JSON โครงสร้าง
      │  validate ด้วย Pydantic + เติม warnings
      ▼
[5] Frontend เติมฟอร์มด้วยผลจาก AI ไฮไลต์ช่อง confidence ต่ำ/มี warning
      │  ผู้ใช้แก้ไขได้
      ▼
[6] กดบันทึก → ลง PostgreSQL (แยกข้อมูลดิบ OCR/AI ออกจากรายการที่ยืนยันแล้ว)

จุดที่ต้องทำให้ชัด: ปุ่มส่ง AI ต้องเห็นง่ายและกดครั้งเดียว เพราะ Tesseract อ่านสลิปไทยได้ไม่ดีนัก ผู้ใช้จะกดปุ่มนี้บ่อย อย่าซ่อนไว้ลึก

OCR ในเครื่อง (ขั้น 2)
แปลงรูปเป็น grayscale, ใช้ adaptive threshold, deskew ด้วย OpenCV ก่อนป้อน Tesseract
เรียก pytesseract.image_to_string(img, lang="tha+eng")
พยายาม parse ด้วย regex เท่าที่ทำได้: หายอดรวม (บรรทัดที่มีคำว่า รวม/สุทธิ/total + ตัวเลข), วันที่ (\d{1,2}/\d{1,2}/\d{2,4}), เลขผู้เสียภาษี 13 หลัก
คำนวณ ocr_quality (0–1) แบบง่ายๆ เช่น อิงจาก: อ่านยอดรวมได้ไหม + อ่านวันที่ได้ไหม + สัดส่วนตัวอักษรที่ Tesseract มั่นใจ (ใช้ image_to_data ดู conf เฉลี่ย)
ถ้า ocr_quality < 0.6 ให้ frontend ขึ้นแบนเนอร์แนะนำให้กดปุ่ม AI

หมายเหตุตามจริง: Tesseract บนสลิปความร้อนภาษาไทยมักได้ยอดรวมกับวันที่พอไหว แต่ชื่อสินค้าและชื่อร้านมักเพี้ยน ให้ถือว่า OCR ในเครื่องเป็น "ตัวช่วยกรอกเบื้องต้น" เท่านั้น ไม่ใช่แหล่งข้อมูลหลัก

AI fallback — KKU IntelSphere (ขั้น 4)

เรียกผ่าน openai SDK โดยตั้ง base_url เป็นของ KKU:

python
from openai import OpenAI
import os, base64, json

client = OpenAI(
    base_url=os.environ["KKU_BASE_URL"],
    api_key=os.environ["KKU_API_KEY"],
)

def extract_with_ai(image_bytes: bytes, mime: str = "image/jpeg") -> dict:
    b64 = base64.b64encode(image_bytes).decode()
    resp = client.chat.completions.create(
        model=os.environ["KKU_VISION_MODEL"],
        temperature=0,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": [
                {"type": "text", "text": USER_PROMPT},
                {"type": "image_url",
                 "image_url": {"url": f"data:{mime};base64,{b64}"}},
            ]},
        ],
        stream=False,
    )
    text = resp.choices[0].message.content
    text = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    return json.loads(text)

ถ้าเทสต์แล้ว KKU_VISION_MODEL ไม่รับ image_url ให้ไล่เปลี่ยนโมเดลใน .env จนเจอตัวที่รับรูปได้ อย่าแก้โค้ด แก้แค่ env

SYSTEM_PROMPT (ให้ AI อ่านใบเสร็จไทย)
คุณคือระบบดึงข้อมูลจากใบเสร็จ ใบกำกับภาษี และสลิปโอนเงินของไทย
ตอบกลับเป็น JSON ที่ parse ได้เท่านั้น ห้ามมี markdown fence หรือคำอธิบายใดๆ

กฎเหล็ก:
- ห้ามเดา ถ้าอ่านฟิลด์ไหนไม่ออกให้ใส่ null และลดค่า confidence ของฟิลด์นั้น
- ตัวเลขทุกค่าให้คงตามที่พิมพ์บนใบเสร็จ ห้ามคำนวณหรือปัดเศษเอง
- วันที่: ถ้าปีเป็น พ.ศ. (มากกว่า 2400 หรือเลข 2 หลักที่ตีความเป็น พ.ศ. ได้) ให้แปลงเป็น ค.ศ. โดยลบ 543 แล้วส่งรูปแบบ YYYY-MM-DD
- ถ้ามีเลขอ้างอิงที่ขึ้นต้นด้วยวันที่แบบ ค.ศ. (เช่น TID) ให้ใช้ไขว้ตรวจสอบวันที่ที่แปลงมา
- document_type เลือกจาก: TAX_INVOICE_FULL | TAX_INVOICE_ABB | RECEIPT | TRANSFER_SLIP | OTHER
- ถ้าราคามีตัวอักษรกำกับต่อท้าย (เช่น N) ให้เก็บไว้ในฟิลด์ flag ของรายการนั้น ห้ามตัดทิ้ง
- line_items: ถ้าอ่านได้แค่บางบรรทัด ให้ส่งเฉพาะบรรทัดที่มั่นใจ แล้วตั้ง line_items_complete = false ห้ามแต่งบรรทัดที่อ่านไม่ออกขึ้นมาเอง
- raw_text: ถอดข้อความทั้งหมดที่เห็นตามลำดับบนใบเสมอ แม้จะจัดโครงสร้างไม่ได้
- unreadable_regions: อธิบายสั้นๆ ว่าส่วนไหนอ่านไม่ออก
- ข้อมูลส่วนบุคคล (ชื่อลูกค้า เลขสมาชิก) ให้ใส่ใน customer แยกไว้ ระบบจะเป็นผู้ตัดสินใจว่าจะเก็บหรือไม่

โครงสร้าง JSON ที่ต้องส่งกลับ:
{
  "document_type": "...",
  "merchant_name": "...",
  "branch": "...",
  "merchant_tax_id": "...",
  "doc_number": "...",
  "issued_at": "YYYY-MM-DD",
  "issued_time": "HH:MM",
  "currency": "THB",
  "line_items": [
    {"qty": 0, "name": "...", "unit_price": 0, "amount": 0, "flag": null, "category_guess": "..."}
  ],
  "line_items_complete": true,
  "item_count_printed": 0,
  "subtotal": 0,
  "discount": 0,
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
  "extra": {}
}
USER_PROMPT
อ่านใบเสร็จในรูปนี้แล้วส่งข้อมูลกลับตามโครงสร้าง JSON ที่กำหนดในระบบ
ให้ความสำคัญกับ total และ issued_at เป็นอันดับแรก
ชั้น validate (Pydantic) — อย่าเชื่อ AI ทันที

หลังได้ JSON ต้องผ่าน Pydantic model นี้เสมอ แล้วเติม warnings เอง:

python
from pydantic import BaseModel, field_validator, model_validator
from decimal import Decimal
from datetime import date
import re

class LineItem(BaseModel):
    qty: Decimal | None = None
    name: str | None = None
    unit_price: Decimal | None = None
    amount: Decimal
    flag: str | None = None
    category_guess: str | None = None

class ReceiptDraft(BaseModel):
    document_type: str
    merchant_name: str | None = None
    merchant_tax_id: str | None = None
    doc_number: str | None = None
    issued_at: date | None = None
    total: Decimal
    subtotal: Decimal | None = None
    vat_amount: Decimal | None = None
    vat_included: bool = True
    payment_method: str | None = None
    line_items: list[LineItem] = []
    line_items_complete: bool = True
    item_count_printed: int | None = None
    confidence: dict[str, float] = {}
    warnings: list[str] = []
    raw_text: str | None = None
    extra: dict = {}

    @field_validator("merchant_tax_id")
    @classmethod
    def tax_id_13(cls, v):
        if v and len(re.sub(r"\D", "", v)) != 13:
            raise ValueError("เลขผู้เสียภาษีไม่ครบ 13 หลัก")
        return v

    @model_validator(mode="after")
    def cross_checks(self):
        # เช็คผลรวมรายการเทียบยอดรวม (เตือน ไม่ใช่ error)
        if self.line_items:
            s = sum((i.amount for i in self.line_items), Decimal(0))
            if abs(s - self.total) > 1:
                self.warnings.append(f"ผลรวมรายการ {s} ≠ ยอดรวม {self.total}")
        # เตือนเรื่อง VAT ถ้ามีรายการติดธง (อาจไม่คิด VAT บางรายการ)
        if any(i.flag for i in self.line_items) and self.vat_included:
            self.warnings.append("มีรายการติดธงกำกับ — ตรวจสอบการคิด VAT ก่อนใช้ทางบัญชี")
        return self

อย่า validate จำนวนบรรทัดเทียบ item_count_printed แบบตายตัว เพราะรายการของแถม (0.00 บาท) มักไม่ถูกนับเป็นชิ้น ให้เช็คผลรวมเงินแทน

โครงสร้างฐานข้อมูล (แยกข้อมูลดิบออกจากที่ยืนยันแล้ว)
sql
CREATE TABLE receipts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_key   TEXT NOT NULL,               -- path ไฟล์รูป
  file_hash     TEXT NOT NULL UNIQUE,        -- SHA-256 กันอัปโหลดซ้ำ
  source        TEXT NOT NULL,               -- 'ocr' | 'ai'  (อ่านด้วยอะไร)
  status        TEXT NOT NULL,               -- pending|needs_review|confirmed|failed
  ocr_quality   NUMERIC(4,3),
  raw_payload   JSONB,                       -- JSON ดิบจาก OCR หรือ AI
  ocr_text      TEXT,                        -- full text ไว้ค้นหา
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE transactions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id     UUID REFERENCES receipts(id),
  direction      TEXT NOT NULL,              -- income | expense
  merchant_name  TEXT,
  merchant_tax_id TEXT,
  occurred_on    DATE NOT NULL,
  currency       CHAR(3) DEFAULT 'THB',
  subtotal       NUMERIC(14,2),
  vat_amount     NUMERIC(14,2) DEFAULT 0,
  total          NUMERIC(14,2) NOT NULL,
  category       TEXT,
  payment_method TEXT,
  note           TEXT,
  verified_by_user BOOLEAN DEFAULT false,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE transaction_items (
  id             BIGSERIAL PRIMARY KEY,
  transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
  line_no        INT,
  name           TEXT,
  qty            NUMERIC(12,3),
  unit_price     NUMERIC(14,2),
  amount         NUMERIC(14,2)
);

CREATE INDEX ON transactions (occurred_on DESC);
CREATE INDEX ON receipts USING gin (raw_payload jsonb_path_ops);
API endpoints (FastAPI)
POST /api/receipts — รับรูป (multipart) → ทำ OCR ในเครื่อง → คืน {receipt_id, source:"ocr", ocr_quality, draft, warnings}
POST /api/receipts/{id}/ai — ปุ่ม "ให้ AI อ่าน" → ส่งรูปเดิมไป KKU Vision → คืน draft ใหม่ source:"ai"
POST /api/transactions — บันทึกรายการที่ผู้ใช้ยืนยันแล้ว (รับ draft ที่แก้ไขแล้วจาก frontend)
GET  /api/transactions?month=YYYY-MM — ลิสต์ + ยอดรวมรายเดือน แยกตามหมวด
GET  /api/receipts/{id}/image — คืนรูปใบเสร็จ (ไว้แสดงคู่ฟอร์มให้ซูมตรวจ)

ทุก endpoint ที่แตะ AI ต้องอ่าน key จาก env เท่านั้น และไม่ส่ง key ออกไปหา frontend

Frontend behavior (React)
หน้าถ่าย/อัปโหลด: ครอปใบเสร็จอัตโนมัติด้วย contour detection ถ้าทำได้ (หรือให้ผู้ใช้ครอปเอง) + เตือนถ้าภาพเบลอ
หน้าตรวจสอบ: แบ่งจอสองฝั่ง — ซ้ายเป็นรูปใบเสร็จ (ซูม/เลื่อนได้) ขวาเป็นฟอร์ม
ช่องที่ confidence < 0.7 หรืออยู่ใน warnings → พื้นหลังเหลือง มีไอคอนเตือน
ช่องที่เป็น null → ว่างไว้ให้กรอก ไม่เติมค่ามั่ว
แบนเนอร์คุณภาพด้านบนฟอร์ม:
source = ocr และ quality ต่ำ → ข้อความ "OCR อ่านได้ไม่ครบ" + ปุ่มเด่น [ ✨ ให้ AI อ่านให้ ]
source = ai → แสดง warnings ที่ได้จาก AI
ปุ่มบันทึกจะกดได้ก็ต่อเมื่อ total และ occurred_on มีค่า (ฟิลด์จำเป็น)
Docker Compose
yaml
services:
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: expense
      POSTGRES_PASSWORD: postgres
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s

  api:
    build: ./api
    env_file: [./api/.env]     # โหลด key จาก .env ไม่เขียนในโค้ด
    depends_on: {db: {condition: service_healthy}}
    ports: ["8000:8000"]

  web:
    build: ./web
    ports: ["3000:3000"]

volumes: {pgdata:}

Dockerfile ของ api ต้องติดตั้ง Tesseract + ภาษาไทย:

dockerfile
RUN apt-get update && apt-get install -y \
    tesseract-ocr tesseract-ocr-tha tesseract-ocr-eng \
    libgl1 && rm -rf /var/lib/apt/lists/*
ลำดับที่อยากให้สร้าง
โครง backend + docker-compose + migration ให้ตารางขึ้นครบ
POST /api/transactions + GET /api/transactions (บันทึก/ดูรายการมือ) ให้แอปใช้งานได้ก่อน
เพิ่ม OCR ในเครื่อง (POST /api/receipts)
เพิ่มปุ่ม AI (POST /api/receipts/{id}/ai) เชื่อม KKU
frontend หน้าตรวจสอบสองฝั่ง + แบนเนอร์คุณภาพ
หน้าสรุปรายเดือน