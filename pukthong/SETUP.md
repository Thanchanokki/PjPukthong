# คู่มือติดตั้ง (สำหรับคนที่เพิ่งโหลดโปรเจกต์มา)

ตั้งแต่ศูนย์จนใช้งานได้ ใช้เวลาประมาณ 10 นาที ส่วนใหญ่รอ Docker build

---

## 1. ต้องมีอะไรในเครื่องบ้าง

| ต้องมี | หมายเหตุ |
|---|---|
| **Docker Desktop** | [ดาวน์โหลด](https://www.docker.com/products/docker-desktop/) |
| **MongoDB** | รันบนเครื่องที่พอร์ต `27017` — [Community Server](https://www.mongodb.com/try/download/community) หรือใช้ MongoDB Atlas แทนก็ได้ |
| **API key ของ KKU IntelSphere** | ขอจาก https://gen.ai.kku.ac.th |

**ไม่ต้องลง** Node.js ในเครื่อง — api กับ web รันใน container ส่วนฐานข้อมูลอยู่นอก compose

เช็คว่า Docker พร้อม (ต้องขึ้นเลขเวอร์ชัน ไม่ใช่ error):

```bash
docker compose version
```

> ถ้าขึ้น `command not found` แปลว่ายังไม่ได้เปิด Docker Desktop — เปิดแอปแล้วรอจนไอคอนวาฬนิ่ง

---

## 2. โหลดโค้ดมา

```bash
git clone https://github.com/Thanchanokki/gujabu.git
cd gujabu/pukthong
```

### ⚠️ ระวังโฟลเดอร์ซ้อนสองชั้น

repo นี้มีโฟลเดอร์ซ้อนกันสองชั้น ไฟล์จริงอยู่**ชั้นใน** (โฟลเดอร์ `pukthong`)

```
gujabu/              ← ชั้นนอก (มีแค่ .git กับ .gitignore)
└── pukthong/        ← ชั้นใน — ทำงานที่นี่
    ├── docker-compose.yml
    ├── backend/
    └── frontend/
```

ถ้าสั่ง `docker compose` แล้วขึ้นแบบนี้ แปลว่าอยู่ผิดชั้น:

```
no configuration file provided: not found
```

แก้ด้วยการ `cd pukthong` เข้าไปอีกชั้น เช็คว่าถูกที่ด้วย `ls` — ต้องเห็น `docker-compose.yml`

---

## 3. ใส่ API key และ JWT_SECRET

```bash
cp backend/.env.example backend/.env
```

เปิด `backend/.env` แล้วเติม key จริงลงในบรรทัด `KKU_API_KEY=`
กับค่าสุ่มลงใน `JWT_SECRET=` (ใช้ลงลายเซ็น token ตอนเข้าสู่ระบบ)

```bash
openssl rand -hex 32          # ได้ค่ามาแล้ววางต่อท้าย JWT_SECRET=
```

```dotenv
KKU_API_KEY=sk_xxxxxxxxxxxxxxxxxxxx
GOOGLE_VISION_API_KEY=AIza…(ไม่บังคับ — ดูด้านล่าง)
MONGODB_URI=mongodb://pukthong_admin:change_me_in_local_env@localhost:27017/pukthong?authSource=admin
JWT_SECRET=3f9c…(ค่าที่สุ่มได้)
```

> **`JWT_SECRET` ว่าง = api ไม่ยอมบูตเลย** โดยตั้งใจ — ถ้าใส่ค่า default ไว้ในโค้ด
> ทุกเครื่องที่ลืมตั้งจะใช้ค่าเดียวกัน แปลว่าใครก็ปลอม token เข้าบัญชีคนอื่นได้
>
> เปลี่ยนค่านี้เมื่อไหร่ ทุกคนที่ล็อกอินค้างไว้จะหลุดออกทันที (ต้องล็อกอินใหม่ ข้อมูลไม่หาย)

> 🔒 `backend/.env` ถูก gitignore ไว้แล้ว **ห้าม commit เด็ดขาด** — ถ้าหลุดขึ้น GitHub ใครก็เอา key ไปใช้ได้

`MONGODB_URI` ต้องตรงกับ user/password ที่สร้างไว้ใน MongoDB ของตัวเอง — `authSource=admin`
หมายถึง "user ตัวนี้ถูกสร้างไว้ในฐานข้อมูล admin" ส่วนข้อมูลจริงเขียนลงฐานข้อมูล `pukthong`

### `GOOGLE_VISION_API_KEY` — ไม่บังคับ แต่ช่วยให้อ่านตัวเลขแม่นขึ้นมาก

ถ้าเติม key นี้ ระบบจะให้ Google Cloud Vision อ่านตัวอักษรบนใบเสร็จตั้งแต่ตอนอัปโหลด
แล้วส่งข้อความนั้นไปพร้อมรูปตอนกดปุ่ม ✨ เพื่อให้ AI ยึดตัวเลขตาม OCR แทนที่จะเดาจากพิกเซล
— ช่วยเรื่องสลิปความร้อนภาษาไทยที่ตัวเลขมักเพี้ยนได้ชัดเจน

ขั้นตอน: GCP console → เปิดใช้ **Cloud Vision API** ใน project → APIs & Services →
Credentials → Create API key → (แนะนำ) กด Restrict key ให้เรียกได้เฉพาะ Cloud Vision API

**ปล่อยว่างไว้ก็ได้** แอปทำงานครบทุกอย่างเหมือนเดิม แค่ข้ามขั้น OCR ไป

ค่าอื่นในไฟล์ใช้ค่า default ได้เลย ไม่ต้องแก้

---

## 4. รัน

```bash
# สร้าง image และเปิดทุกบริการ (ครั้งแรกใช้เวลา 3–5 นาที)
docker compose up -d --build

# สร้าง index ในฐานข้อมูล (ครั้งแรกครั้งเดียว — สั่งซ้ำได้ไม่มีผลข้างเคียง)
docker compose run --rm api npm run migrate
```

ควรเห็นข้อความ `สร้าง index ครบแล้วในฐานข้อมูล 'pukthong'`

> ถ้าขึ้น `MongoServerSelectionError` แปลว่าต่อฐานข้อมูลไม่ได้ — ดูข้อ 9

---

## 5. เช็คว่าใช้งานได้จริง

```bash
docker compose ps
```

ต้องขึ้นครบ 2 บริการ (`api`, `web`) สถานะ `Up` — ฐานข้อมูลรันอยู่นอก compose

```bash
curl -s http://localhost:8000/api/health
```

ต้องได้แบบนี้ — **`ai_configured` ต้องเป็น `true`** ถ้าเป็น `false` แปลว่า key ยังไม่เข้า

```json
{"status":"ok","vision_model":"gemini-2.5-flash","ai_configured":true,"ocr_configured":true}
```

| เปิดที่ไหน | URL |
|---|---|
| เว็บแอป | http://localhost:3000 |
| เช็คสถานะ API | http://localhost:8000/api/health |
| MongoDB (Compass / `mongosh`) | `mongodb://pukthong_admin:***@localhost:27017/pukthong?authSource=admin` |

> ใน `docker-compose.yml` ตัว api คุยกับฐานข้อมูลผ่าน `host.docker.internal:27017`
> ไม่ใช่ `localhost` เพราะ localhost ใน container คือตัว container เอง

ลองใช้จริง: เปิด http://localhost:3000 → **สมัครสมาชิก** → เลือกรูปใบเสร็จ →
กด **✨ ให้ AI อ่านให้** → ตรวจข้อมูล → กดบันทึก

ครั้งแรกจะเจอหน้าเข้าสู่ระบบก่อนเสมอ — กด "สมัครสมาชิก" ที่ท้ายหน้าเพื่อสร้างบัญชี
(รหัสผ่านอย่างน้อย 8 ตัวอักษร) ระบบจะพาเข้าแอปให้เลยโดยไม่ต้องล็อกอินซ้ำ

---

## 6. ใช้จากมือถือ (ไม่บังคับ)

หา IP เครื่องตัวเอง:

```bash
ipconfig getifaddr en0        # macOS
```

เพิ่ม IP นั้นเข้า `CORS_ORIGINS` ใน `backend/.env` **ไม่งั้นบันทึกไม่ได้**

```dotenv
CORS_ORIGINS=http://localhost:3000,http://192.168.1.50:3000
```

**และต้องแก้ `VITE_API_BASE` ใน `docker-compose.yml` ด้วย** ไม่งั้นหน้าเว็บเปิดได้แต่ยิง API ไม่เจอ

```yaml
  web:
    environment:
      VITE_API_BASE: http://192.168.1.50:8000    # IP ของเครื่อง ไม่ใช่ localhost
```

> โค้ดฝั่ง frontend ทำงานใน browser ของ **ผู้ใช้** ไม่ใช่ในเครื่องเรา — พอเปิดจากมือถือ
> คำว่า `localhost:8000` จึงหมายถึง "พอร์ต 8000 ของมือถือเครื่องนั้น" ซึ่งไม่มีอะไรรันอยู่
> ค่า IP นี้ใช้ได้ทั้งตอนเปิดจากเครื่องตัวเองและจากมือถือ จึงตั้งค้างไว้ได้เลย

แล้วสั่ง `docker compose up -d api web` (ไม่ใช่ `restart` — ดูหัวข้อถัดไป)

เปิด `http://<IP>:3000` จากมือถือที่อยู่ Wi-Fi เดียวกัน แล้ว "Add to Home Screen" เพื่อใช้แบบแอป — ปุ่มถ่ายรูปจะเรียกกล้องหลังให้เลย

> ไม่ต้องมี HTTPS — ปุ่มถ่ายรูปใช้ `<input type="file" capture>` ซึ่งเป็นการเปิดแอปกล้อง
> ของเครื่อง (ต่างจาก `getUserMedia` ที่บังคับ HTTPS) จึงทำงานบน `http://` ใน LAN ได้ปกติ

> ⚠️ IP ที่ router แจกมักเปลี่ยนเมื่อเปลี่ยน Wi-Fi หรือรีสตาร์ตเราเตอร์ — ถ้าอยู่ๆ มือถือ
> ใช้ไม่ได้ ให้เช็ค `ipconfig getifaddr en0` ใหม่แล้วแก้ทั้งสองที่ให้ตรงกัน

---

## 7. ⚠️ แก้ `.env` แล้วต้องใช้ `up -d` ไม่ใช่ `restart`

```bash
docker compose up -d api      # ✅ สร้าง container ใหม่ อ่าน .env ใหม่
docker compose restart api    # ❌ ใช้ค่าเดิมที่ค้างอยู่ ไม่อ่าน .env ใหม่
```

ค่าใน `env_file` ถูกฉีดเข้า container ตอน *สร้าง* เท่านั้น แก้ไฟล์แล้วสั่ง `restart` จึงไม่มีผล

---

## 8. คำสั่งที่ใช้ประจำ

```bash
docker compose up -d          # เปิด
docker compose down           # ปิด (ข้อมูลและรูปไม่หาย เก็บใน volume)
docker compose logs -f api    # ดู log backend
docker compose logs -f web    # ดู log frontend
docker compose ps             # ดูสถานะ
```

แก้โค้ดใน `backend/src/` หรือ `frontend/src/` แล้ว **hot reload ให้เอง** ไม่ต้อง restart

---

## 9. เจอปัญหา

| อาการ | สาเหตุ / วิธีแก้ |
|---|---|
| `no configuration file provided: not found` | อยู่ผิดชั้น — `cd` เข้าโฟลเดอร์ `pukthong` ชั้นใน (ดูข้อ 2) |
| `env file ./backend/.env not found` | ยังไม่ได้สร้าง `backend/.env` — ทำตามข้อ 3 |
| `MongoServerSelectionError` | MongoDB ยังไม่ได้เปิด หรือ URI ผิด — เช็คด้วย `mongosh "$MONGODB_URI"` แล้วสั่ง `docker compose up -d api` |
| `Authentication failed` | user/password ใน `MONGODB_URI` ไม่ตรง หรือลืม `?authSource=admin` |
| api ล้มทันทีพร้อมข้อความ `ยังไม่ได้ตั้ง JWT_SECRET` | ยังไม่ได้เติม `JWT_SECRET` ใน `backend/.env` — ทำตามข้อ 3 แล้วสั่ง `docker compose up -d api` |
| ล็อกอินอยู่ดีๆ แล้วหลุดออกเอง | `JWT_SECRET` ถูกเปลี่ยน หรือ token หมดอายุ (ค่าเริ่มต้น 7 วัน ปรับที่ `JWT_EXPIRES_IN`) — ล็อกอินใหม่ได้เลย |
| อัปโหลดใบเสร็จแล้วขึ้น 401 | token หมดอายุ — refresh หน้าเว็บแล้วล็อกอินใหม่ |
| สมัครแล้วขึ้น `อีเมลนี้ถูกใช้ไปแล้ว` | มีบัญชีอยู่แล้ว (อีเมลไม่แยกตัวพิมพ์เล็ก-ใหญ่) — กด "เข้าสู่ระบบ" แทน |
| `ai_configured: false` | key ยังไม่เข้า — เช็คว่าเติม `KKU_API_KEY` แล้วสั่ง `docker compose up -d api` |
| `ocr_configured: false` | ยังไม่ได้เติม `GOOGLE_VISION_API_KEY` — ไม่ใช่ปัญหา แอปใช้ได้ปกติ แค่ข้ามขั้น OCR (ดูข้อ 3) |
| ตั้ง key แล้วแต่ log ขึ้น `Cloud Vision ตอบ HTTP 403` | ยังไม่ได้เปิด Cloud Vision API ใน GCP project หรือ key ถูก restrict ไว้ผิดตัว |
| log ขึ้น `Cloud Vision ตอบ HTTP 429` | โควตาหมด (ฟรี 1,000 ครั้ง/เดือน) — ระบบข้าม OCR ให้เอง ยังกดปุ่ม ✨ ได้ตามปกติ |
| กดปุ่ม ✨ แล้วขึ้น error 502 | โมเดลอาจไม่รับรูป — เปลี่ยน `KKU_VISION_MODEL` ใน `backend/.env` **อย่าแก้โค้ด** (ดูข้อ 10) |
| หน้าเว็บเปิดได้แต่บันทึกไม่ได้ | CORS — เพิ่ม URL ที่เปิดอยู่เข้า `CORS_ORIGINS` (ดูข้อ 6) |
| `port is already allocated` | มีอะไรใช้พอร์ต 3000/8000 อยู่ — ปิดตัวนั้น หรือแก้พอร์ตใน `docker-compose.yml` |
| อยากเริ่มใหม่หมด (⚠️ ข้อมูลหายทั้งหมด) | `docker compose down -v && docker compose up -d --build` แล้วลบฐานข้อมูลด้วย `mongosh "$MONGODB_URI" --eval "db.dropDatabase()"` |

ดู JSON ดิบที่ AI ตอบกลับมา เวลาผลอ่านเพี้ยน:

```bash
curl -s http://localhost:8000/api/receipts/<receipt_id>/raw
```

---

## 10. ถ้า AI อ่านใบเสร็จไม่ได้

เปลี่ยนโมเดลใน `backend/.env` แล้ว `docker compose up -d api` — **อย่าแก้โค้ด**

```dotenv
KKU_VISION_MODEL=gemini-3.5-flash    # หรือ gemini-2.5-flash, gpt-5
```

ดูรายชื่อโมเดลที่ endpoint ปล่อยทั้งหมด:

```bash
docker compose exec api node -e "
const {OpenAI} = require('openai');
const c = new OpenAI({baseURL: process.env.KKU_BASE_URL, apiKey: process.env.KKU_API_KEY});
c.models.list().then(r => console.log(r.data.map(m => m.id).sort().join('\n')));"
```

---

## 11. โครงสร้างโปรเจกต์

```
docker-compose.yml   นิยาม 2 บริการ: api, web (MongoDB รันนอก compose)
backend/             Fastify + MongoDB driver + Zod  (TypeScript)
  src/server.ts      จุดเริ่ม: ต่อ DB แล้วเปิดพอร์ต
  src/app.ts         ประกอบ Fastify: plugin, error handler, ลงทะเบียน route
  src/config/        อ่านค่าทั้งหมดจาก .env
  src/db/            การเชื่อมต่อ (client) / index / รูปร่าง document (models)
  src/shared/        ของกลางที่ทุก module ใช้: errors, money, ตัวช่วย zod
  src/modules/       แยกตามฟีเจอร์ — auth, receipts, transactions
                     แต่ละตัวมี controller (HTTP) / service (ตรรกะ)
                     / schema (ตรวจ input) / serializer (แปลงเป็น JSON)
  src/scripts/       คำสั่งที่รันเองจาก CLI เช่น migrate
  .env               🔒 API key + MONGODB_URI อยู่ที่นี่ที่เดียว — ห้าม commit
  .env.example       เทมเพลตค่าว่าง (commit ได้)
frontend/            React + Vite + Tailwind + TanStack Query
  src/pages/         ถ่ายใบเสร็จ / ตรวจใบเสร็จ / กรอกเอง / สรุปรายเดือน
  src/components/    ฟอร์มที่หน้าตรวจใบเสร็จกับหน้ากรอกเองใช้ร่วมกัน
```

**API key อยู่ที่ backend เท่านั้น** frontend ไม่เคยถือ key และยิงผ่าน `/api/*` ของเราเสมอ

---

## 12. เรื่องความปลอดภัยที่ต้องรู้

- แอปนี้ออกแบบสำหรับ **ผู้ใช้คนเดียวบนเครื่องตัวเอง ไม่มีระบบ login**
- ถ้าจะ deploy ขึ้นอินเทอร์เน็ต **ต้องเพิ่ม auth ก่อน** ไม่งั้นใครก็ยิง `/api/receipts/{id}/extract` ใช้ API key ของคุณได้ฟรี
- ข้อมูลส่วนบุคคลบนใบเสร็จ (ชื่อลูกค้า เลขสมาชิก) ไม่ถูกเก็บลงตาราง `transactions` — เก็บไว้เฉพาะใน `receipts.raw_payload`
- เงินทุกจำนวนใช้ `NUMERIC(14,2)` และคำนวณด้วย `decimal.js` **ห้ามใช้ `Number()` กับค่าเงิน** เพราะ float ของ JS จะทำให้ยอดเพี้ยนแบบเงียบๆ
