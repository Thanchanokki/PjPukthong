/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      /**
       * ธีม "ม้วนใบเสร็จ" จาก UX/UI mockup ที่ตกลงกับอาจารย์ไว้ — ตอนนี้ใช้กับหน้า
       * เข้าสู่ระบบ/สมัครสมาชิก (หน้าอื่นยังเป็น teal/slate เดิม)
       *
       * ประกาศไว้ที่นี่ที่เดียว ห้าม hardcode hex ในไฟล์อื่น
       */
      colors: {
        paper: "#F5F1E6", // พื้นหลังหลัก
        ink: "#211D17", // ตัวอักษรหลัก / พื้นหลังส่วนเข้ม
        stamp: "#BD4A3C", // สีเน้น: ปุ่มหลัก, รายจ่าย
        ledger: "#3A6B4C", // รายรับ, สถานะสำเร็จ
        kraft: "#D9CFBB", // เส้นขอบ
      },
      fontFamily: {
        // ตัวเลขเงิน, label ตัวเล็ก
        mono: ['"Space Mono"', "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
