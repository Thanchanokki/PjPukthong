/**
 * ไอคอนของหน้า "เพิ่มรายการใหม่" — แปลงมาจากไฟล์ SVG ที่ออกแบบไว้
 * (Iconcamera.svg, Iconselements.svg, Iconscreate.svg)
 *
 * เปลี่ยน stroke/fill ที่ตายตัวเป็นสี #B23A2E เดิม ให้เป็น currentColor แทน
 * เพื่อให้คุมสีผ่าน className (เช่น text-stamp) ได้เหมือน icon อื่นในโปรเจกต์ —
 * ไม่งั้นถ้าอยากเปลี่ยนธีมสีทีหลังต้องไปไล่แก้ไฟล์ svg ทีละไฟล์
 */
import type { SVGProps } from "react";

/** ใช้กับ "ถ่ายภาพใบเสร็จ" */
export function CameraIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 37 31" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path
        d="M34.0833 25.3333C34.0833 26.1069 33.776 26.8487 33.2291 27.3957C32.6821 27.9427 31.9402 28.25 31.1667 28.25H4.91667C4.14312 28.25 3.40125 27.9427 2.85427 27.3957C2.30729 26.8487 2 26.1069 2 25.3333V9.29167C2 8.51812 2.30729 7.77625 2.85427 7.22927C3.40125 6.68229 4.14312 6.375 4.91667 6.375H10.75L13.6667 2H22.4167L25.3333 6.375H31.1667C31.9402 6.375 32.6821 6.68229 33.2291 7.22927C33.776 7.77625 34.0833 8.51812 34.0833 9.29167V25.3333Z"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18.0417 22.4167C21.2633 22.4167 23.875 19.805 23.875 16.5833C23.875 13.3617 21.2633 10.75 18.0417 10.75C14.82 10.75 12.2083 13.3617 12.2083 16.5833C12.2083 19.805 14.82 22.4167 18.0417 22.4167Z"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** ใช้กับ "อัพโหลดจากคลังภาพ" */
export function UploadIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 35 33" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path
        d="M17.5 21.5L17.5 1.5M17.5 21.5C16.0995 21.5 13.4831 17.5114 12.5 16.5M17.5 21.5C18.9005 21.5 21.5169 17.5114 22.5 16.5"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M33.5 25.5C33.5 30.464 32.464 31.5 27.5 31.5H7.5C2.536 31.5 1.5 30.464 1.5 25.5"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** ใช้กับ "กรอกด้วยตนเอง" */
export function PencilIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 33 32" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path
        d="M4.125 22.9999V27.9999H9.28125L24.4887 13.2532L19.3325 8.25325L4.125 22.9999ZM28.4762 9.38658C29.0125 8.86658 29.0125 8.02658 28.4762 7.50658L25.2588 4.38658C24.7225 3.86658 23.8562 3.86658 23.32 4.38658L20.8038 6.82658L25.96 11.8266L28.4762 9.38658Z"
        fill="currentColor"
      />
    </svg>
  );
}

/**
 * ไอคอนของ BottomNav (หน้าหลัก / รายการ / รายงาน / งบประมาณ) — วาดเป็นเส้น (stroke)
 * ให้เข้าชุดเดียวกัน น้ำหนักเส้นเท่ากันทุกตัว (1.6) ต่างจาก 3 ตัวข้างบนที่เป็นไอคอน
 * ของหน้า capture โดยเฉพาะ
 */
export function HomeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M3.5 10.5 12 3l8.5 7.5" />
      <path d="M5.5 9.3V20a1 1 0 0 0 1 1H10v-5.5a2 2 0 0 1 2-2 2 2 0 0 1 2 2V21h3.5a1 1 0 0 0 1-1V9.3" />
    </svg>
  );
}

export function ListIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <rect x="5" y="4.5" width="14" height="16" rx="2" />
      <path d="M9 3.5h6a1 1 0 0 1 1 1V6H8V4.5a1 1 0 0 1 1-1Z" />
      <path d="M8.5 11.5h7M8.5 15h7M8.5 18.5h4" />
    </svg>
  );
}

export function PieChartIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5V12h8.5" />
    </svg>
  );
}

export function BudgetIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <rect x="3.5" y="4" width="12.5" height="16" rx="1.5" />
      <path d="M6.5 9h6.5M6.5 12.5h4.5" />
      <path d="M13.7 16.3 19.4 10.6a1.6 1.6 0 0 0-2.3-2.3L11.4 14l-.8 2.9 2.9-.6Z" />
    </svg>
  );
}

/** ปุ่มย้อนกลับที่ header ของหน้า "กรอกด้วยตนเอง" */
export function ArrowLeftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M19 12H5" />
      <path d="M11 6l-6 6 6 6" />
    </svg>
  );
}