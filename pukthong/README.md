# Pukthong — บันทึกรายรับรายจ่ายจากใบเสร็จ

สมัครสมาชิก/เข้าสู่ระบบ → ถ่ายรูปใบเสร็จ → AI อ่านให้ → **ผู้ใช้ตรวจและยืนยัน** → บันทึกลง MongoDB

ทุกคนเห็นเฉพาะใบเสร็จและรายการของตัวเอง

ไม่มีการบันทึกอัตโนมัติ ผู้ใช้ต้องกดยืนยันเสมอ และกรอกมือเติมได้เมื่อ AI อ่านไม่ครบ

> เพิ่งโหลดโปรเจกต์มาครั้งแรก? อ่าน **[SETUP.md](SETUP.md)** — มีขั้นตอนละเอียดและวิธีแก้ปัญหาที่เจอบ่อย

## เริ่มใช้งาน

```bash
# 1. ใส่ API key, connection string ของ MongoDB และ JWT_SECRET
cp backend/.env.example backend/.env
#    แก้ KKU_API_KEY, MONGODB_URI และ JWT_SECRET ในไฟล์ backend/.env
#    (ไฟล์นี้ถูก gitignore ไว้แล้ว ห้าม commit)
#    สุ่ม JWT_SECRET ด้วย:  openssl rand -hex 32   ← ไม่ตั้ง = api ไม่ยอมบูต

# 2. รัน
docker compose up -d --build

# 3. สร้าง index (ครั้งแรกครั้งเดียว — สั่งซ้ำได้ไม่มีผลข้างเคียง)
docker compose run --rm api npm run migrate
```

| บริการ | URL |
|---|---|
| เว็บแอป | http://localhost:3000 |
| API docs (Swagger) | http://localhost:8000/docs |
| MongoDB | `localhost:27017` — ฐานข้อมูล `pukthong` (ต่อด้วย Compass / `mongosh`) |

> MongoDB **ไม่ได้อยู่ใน compose** — ต้องรันเองบนเครื่อง (หรือชี้ `MONGODB_URI` ไป Atlas ก็ได้)
> ตัว container คุยกับเครื่องผ่าน `host.docker.internal` ไม่ใช่ `localhost` (ตั้งไว้ให้แล้วใน `docker-compose.yml`)

## ⚠️ แก้ `.env` แล้วต้องใช้ `up -d` ไม่ใช่ `restart`

```bash
docker compose up -d api      # ✅ สร้าง container ใหม่ อ่าน .env ใหม่
docker compose restart api    # ❌ ใช้ค่าเดิมที่ค้างอยู่ ไม่อ่าน .env ใหม่
```

ค่าใน `env_file` ถูกฉีดเข้า container ตอน *สร้าง* เท่านั้น และ environment variable
ชนะค่าในไฟล์ `.env` เสมอ — แก้ไฟล์แล้วสั่ง `restart` จึงไม่มีผล

เช็คว่าค่าเข้าไปจริงไหม:

```bash
curl -s http://localhost:8000/api/health
# {"status":"ok","vision_model":"gemini-3.5-flash-lite","ai_configured":true}
```

## ใช้จากมือถือ

เปิด `http://<IP ของเครื่อง>:3000` จากมือถือที่อยู่ใน Wi-Fi เดียวกัน แล้ว
"Add to Home Screen" เพื่อใช้แบบ PWA — ปุ่มถ่ายรูปจะเรียกกล้องหลังให้เลย

หา IP: `ipconfig getifaddr en0`

> ถ้าเปิดจากมือถือแล้วบันทึกไม่ได้ ให้เพิ่ม IP นั้นเข้า `CORS_ORIGINS` ใน `backend/.env`
> เช่น `CORS_ORIGINS=http://localhost:3000,http://192.168.1.50:3000` แล้ว `docker compose up -d api`

## โครงสร้าง

```
backend/   Fastify + MongoDB driver + Zod  — คุยกับ KKU IntelSphere และฐานข้อมูล
web/   React + Vite + Tailwind + TanStack Query
```

ทั้งโปรเจกต์เป็น TypeScript ภาษาเดียว — เงินทุกจำนวนเดินทางเป็น **string** ตลอดเส้นทาง
(frontend → API → `NUMERIC(14,2)` → API) และคำนวณผ่าน `decimal.js` เท่านั้น
**ห้ามใช้ `Number()` กับค่าเงินเด็ดขาด** เพราะ float ของ JS จะทำให้ยอดเพี้ยนแบบเงียบๆ

**API key อยู่ที่ backend เท่านั้น** frontend ไม่เคยถือ key และยิงผ่าน `/api/*` ของเราเสมอ

**ทุก endpoint ต้องล็อกอิน** ยกเว้น `/api/health`, `/api/auth/register` และ `/api/auth/login`
— frontend แนบ `Authorization: Bearer <token>` ให้เองทุก request และทุก query ฝั่ง backend
กรองด้วย `userId` เสมอ ใบเสร็จ/รายการของคนอื่นจึงตอบ `404` เหมือนไม่มีอยู่จริง

## โครงสร้างข้อมูล

MongoDB สร้าง collection ให้เองตอนเขียนครั้งแรก จึงไม่มี migration แบบ SQL —
`npm run migrate` เหลือหน้าที่แค่สร้าง index (สั่งซ้ำได้ไม่มีผลข้างเคียง)

```bash
docker compose run --rm api npm run migrate
```

| Collection | เก็บอะไร |
|---|---|
| `users` | บัญชีผู้ใช้ — เก็บเฉพาะ `passwordHash` (bcrypt) ไม่เคยเก็บรหัสผ่านจริง, `email` เป็น unique index |
| `receipts` | รูปที่อัปโหลด, สถานะ, คะแนนความเบลอ, JSON ดิบจาก AI (`userId + fileHash` เป็น unique index กันอัปซ้ำ) |
| `transactions` | รายการที่ผู้ใช้ยืนยันแล้ว โดย**ฝังรายการย่อยไว้ใน `items` ของ document เดียวกัน** |

`receipts` กับ `transactions` มี `userId` ชี้กลับไปที่ `users._id` — **ทุก query ต้องกรองด้วย
ฟิลด์นี้** ไม่งั้นข้อมูลข้ามคน กันอัปซ้ำจึง unique ที่ `userId + fileHash` ไม่ใช่ `fileHash`
เดี่ยวๆ เพราะคนละคนอัปโหลดใบเสร็จรูปเดียวกันได้ ไม่ถือว่าซ้ำ

> ฐานข้อมูลที่สร้างไว้ก่อนมีระบบล็อกอินยังค้าง unique index เก่าอยู่ — สั่ง `npm run migrate`
> ครั้งเดียวจะทิ้งตัวเก่าและสร้างตัวใหม่ให้เอง ส่วนข้อมูลเดิมที่ไม่มี `userId` จะมองไม่เห็น
> (ผูกเจ้าของให้ทีหลังได้ด้วย `db.receipts.updateMany({userId:{$exists:false}},{$set:{userId:"<id ของ user>"}})`)

`_id` เป็น UUID string ที่แอปสร้างเอง ไม่ใช่ ObjectId — API จึงยังคืน id รูปแบบเดิม
ส่วนยอดเงินทุกก้อนเก็บเป็น **string** ไม่ใช่ number เพราะ BSON double เป็น float
ซึ่งทำให้ยอดเพี้ยนเงียบๆ  แก้โครงสร้าง: แก้ `backend/src/db/models.ts` ให้ตรงกับที่เขียนจริง

## Flow

0. `POST /api/auth/register` หรือ `/api/auth/login` — ได้ `{ token, user }` กลับมา
   frontend เก็บ token ไว้ใน `localStorage` แล้วแนบไปกับทุก request หลังจากนั้น
1. `POST /api/receipts` — อัปโหลด → แปลง HEIC→JPEG, ย่อรูป, กัน dedupe ด้วย SHA-256, เช็คภาพเบลอ
   (ยังไม่เรียก AI เพื่อให้เตือนเรื่องภาพเบลอได้ก่อนเสียค่า API)
2. `POST /api/receipts/{id}/extract` — ปุ่ม ✨ ให้ AI อ่าน (กดซ้ำได้ถ้าผลไม่ดี)
3. ผู้ใช้ตรวจในฟอร์ม — ช่องที่ AI ไม่มั่นใจจะเป็นพื้นเหลือง ช่องที่อ่านไม่ออกเว้นว่างไว้
4. `POST /api/transactions` — บันทึกเมื่อผู้ใช้กดยืนยัน

> `GET /api/receipts/{id}/image` เป็น endpoint เดียวที่รับ token ทาง `?token=` ได้ด้วย
> เพราะ `<img src>` แนบ header เองไม่ได้

## ถ้า AI อ่านไม่ได้

ลองเปลี่ยนโมเดลใน `backend/.env` แล้ว `docker compose up -d api` — **อย่าแก้โค้ด**

```dotenv
KKU_VISION_MODEL=gemini-3.5-flash    # หรือ gemini-3.7-flash, gpt-5
```

ดูรายชื่อโมเดลที่ endpoint ปล่อยทั้งหมด:

```bash
docker compose exec api node -e "
const {OpenAI} = require('openai');
const c = new OpenAI({baseURL: process.env.KKU_BASE_URL, apiKey: process.env.KKU_API_KEY});
c.models.list().then(r => console.log(r.data.map(m => m.id).sort().join('\n')));"
```

ดู JSON ดิบที่ AI ตอบกลับมาได้ที่ `GET /api/receipts/{id}/raw` เวลาผลอ่านเพี้ยน

## หมายเหตุด้านความปลอดภัย

แอปนี้ออกแบบสำหรับ **ผู้ใช้คนเดียวบนเครื่องตัวเอง** ไม่มีระบบ login
ถ้าจะ deploy ขึ้นอินเทอร์เน็ตต้องเพิ่ม auth ก่อน ไม่งั้นใครก็ยิง `/extract`
ใช้ API key ของคุณได้ฟรี

ข้อมูลส่วนบุคคลบนใบเสร็จ (ชื่อลูกค้า เลขสมาชิก) ไม่ถูกเก็บลงตาราง `transactions`
เก็บไว้เฉพาะใน `receipts.raw_payload` เท่านั้น
