import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { type Category, type CategoryInput, createCategory, fetchCategories, updateCategory } from "../api";
import { CATEGORIES_KEY, groupCategories, labelOf } from "../categories";
import { ArrowLeftIcon } from "../components/icons";

/**
 * จัดการหมวดหมู่ — หมวดกลางของระบบดูได้อย่างเดียว ส่วนหมวดที่สร้างเองแก้/ซ่อนได้
 *
 * ไม่มีปุ่ม "ลบ" โดยตั้งใจ: รายการเก่าที่อยู่ในหมวดนั้นยังต้องแสดงชื่อหมวดได้
 * การซ่อนทำให้หมวดหายจากดรอปดาวน์ แต่ข้อมูลเดิมไม่เสียและเปิดกลับมาได้
 */
export default function CategoriesPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: all = [], isLoading } = useQuery({
    queryKey: [...CATEGORIES_KEY, "all"],
    queryFn: () => fetchCategories(true),
  });

  // ทุกหน้าที่ใช้หมวด (ดรอปดาวน์ หน้างบ) อ่านจาก key เดียวกัน — invalidate ทีเดียวเห็นทุกที่
  const refresh = () => qc.invalidateQueries({ queryKey: CATEGORIES_KEY });

  const create = useMutation({ mutationFn: createCategory, onSuccess: refresh });
  const update = useMutation({
    mutationFn: (v: { id: string; input: CategoryInput }) => updateCategory(v.id, v.input),
    onSuccess: refresh,
  });

  const active = all.filter((c) => c.is_active);
  const hidden = all.filter((c) => !c.is_active);
  const error = (create.error ?? update.error) as Error | null;

  return (
    <div className="mx-auto -mt-6 max-w-2xl space-y-4 pb-4">
      <div className="-mx-4 rounded-b-2xl bg-ink px-4 py-5 text-paper sm:-mx-6 sm:px-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            aria-label="ย้อนกลับ"
            className="-ml-1 rounded-full p-1.5 transition hover:bg-white/10"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </button>
          <h1 className="text-base font-semibold">หมวดหมู่</h1>
        </div>
      </div>

      <AddCategory
        roots={active.filter((c) => !c.parent_id)}
        pending={create.isPending}
        onAdd={(input) => create.mutateAsync(input)}
      />

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {error.message}
        </div>
      )}

      {isLoading ? (
        <p className="py-6 text-center text-sm text-ink/50">กำลังโหลด…</p>
      ) : (
        <ul className="divide-y divide-ink/10 rounded-xl border border-ink/10 bg-white">
          {groupCategories(active).map(({ root, children }) => (
            <li key={root.id}>
              <CategoryRow
                category={root}
                onSave={(input) => update.mutate({ id: root.id, input })}
              />
              {children.length > 0 && (
                <ul className="border-t border-ink/5 bg-paper/40">
                  {children.map((c) => (
                    <li key={c.id} className="pl-6">
                      <CategoryRow
                        category={c}
                        onSave={(input) => update.mutate({ id: c.id, input })}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {hidden.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-ink/60">หมวดที่ซ่อนไว้</h2>
          <ul className="divide-y divide-ink/10 rounded-xl border border-ink/10 bg-white">
            {hidden.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="min-w-0 flex-1 truncate text-ink/50">{labelOf(c)}</span>
                <button
                  onClick={() => update.mutate({ id: c.id, input: { is_active: true } })}
                  className="text-xs font-medium text-stamp hover:underline"
                >
                  แสดงอีกครั้ง
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function AddCategory({
  roots,
  pending,
  onAdd,
}: {
  roots: Category[];
  pending: boolean;
  onAdd: (input: CategoryInput) => Promise<unknown>;
}) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [color, setColor] = useState("#0F766E");
  const [parent, setParent] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await onAdd({ name: name.trim(), icon: icon.trim() || null, color, parent_id: parent || null });
      setName("");
      setIcon("");
    } catch {
      /* ข้อความ error แสดงที่หน้าหลักผ่าน create.error แล้ว — คงค่าที่พิมพ์ไว้ให้แก้ต่อ */
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-ink/10 bg-white p-4">
      <p className="text-sm font-medium">เพิ่มหมวดใหม่</p>
      <div className="flex gap-2">
        <input
          className="field w-14 text-center"
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          placeholder="🙂"
          aria-label="ไอคอน (อีโมจิ)"
          maxLength={8}
        />
        <input
          className="field min-w-0 flex-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ชื่อหมวด เช่น ของเล่นลูก"
          aria-label="ชื่อหมวด"
          maxLength={40}
        />
        <input
          type="color"
          className="h-10 w-10 shrink-0 cursor-pointer rounded-lg border border-slate-300"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          aria-label="สีของหมวด"
        />
      </div>
      <select className="field" value={parent} onChange={(e) => setParent(e.target.value)}>
        <option value="">เป็นหมวดหลัก</option>
        {roots.map((r) => (
          <option key={r.id} value={r.id}>
            หมวดย่อยของ {labelOf(r)}
          </option>
        ))}
      </select>
      <button type="submit" disabled={!name.trim() || pending} className="btn-primary w-full">
        {pending ? "กำลังเพิ่ม…" : "เพิ่มหมวด"}
      </button>
    </form>
  );
}

/** หมวดกลางแสดงอย่างเดียว ส่วนหมวดที่สร้างเองกดแก้ชื่อ/ไอคอน/สี หรือซ่อนได้ */
function CategoryRow({
  category: c,
  onSave,
}: {
  category: Category;
  onSave: (input: CategoryInput) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(c.name);
  const [icon, setIcon] = useState(c.icon ?? "");
  const [color, setColor] = useState(c.color ?? "#0F766E");

  if (editing) {
    return (
      <form
        className="flex items-center gap-2 px-4 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          onSave({ name: name.trim(), icon: icon.trim() || null, color });
          setEditing(false);
        }}
      >
        <input
          className="field w-12 text-center"
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          aria-label="ไอคอน"
          maxLength={8}
        />
        <input
          className="field min-w-0 flex-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="ชื่อหมวด"
          maxLength={40}
          autoFocus
        />
        <input
          type="color"
          className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-slate-300"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          aria-label="สีของหมวด"
        />
        <button type="submit" className="text-xs font-medium text-stamp">
          บันทึก
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-xs text-ink/50">
          ยกเลิก
        </button>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 text-sm">
      <span
        className="h-3 w-3 shrink-0 rounded-full"
        style={{ backgroundColor: c.color ?? "#94A3B8" }}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 truncate">{labelOf(c)}</span>
      {c.is_system ? (
        <span className="rounded bg-ink/5 px-1.5 py-0.5 text-[11px] text-ink/45">ระบบ</span>
      ) : (
        <>
          <button onClick={() => setEditing(true)} className="text-xs font-medium text-stamp hover:underline">
            แก้ไข
          </button>
          <button
            onClick={() => onSave({ is_active: false })}
            className="text-xs text-ink/50 hover:text-red-600"
          >
            ซ่อน
          </button>
        </>
      )}
    </div>
  );
}
