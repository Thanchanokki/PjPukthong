FROM node:22-alpine

ENV NODE_ENV=development
WORKDIR /app

# ติดตั้ง dependency ก่อน copy โค้ด — layer นี้จะถูก cache ไว้
# sharp มี prebuilt binary สำหรับ musl/alpine อยู่แล้ว ไม่ต้องลง libvips เอง
COPY package.json package-lock.json* ./
RUN npm install

COPY . .

# โฟลเดอร์เก็บรูป (ถูก mount ทับด้วย named volume ใน compose)
RUN mkdir -p /data/uploads

EXPOSE 8000
CMD ["npm", "run", "dev"]
