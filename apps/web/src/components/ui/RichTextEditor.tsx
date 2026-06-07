"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { useRef } from "react";

type Props = {
  /** When provided, the HTML is mirrored into a hidden input with this name. */
  name?: string;
  defaultValue?: string | null;
  placeholder?: string;
  minHeight?: string;
  /** Called with the current HTML on every edit (for controlled usage). */
  onChange?: (html: string) => void;
};

export function RichTextEditor({
  name,
  defaultValue,
  placeholder,
  minHeight = "8rem",
  onChange,
}: Props) {
  const initial = defaultValue && defaultValue !== "<p></p>" ? defaultValue : "";
  const hiddenRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: placeholder ?? "" }),
    ],
    content: initial,
    immediatelyRender: false,
    editorProps: {
      attributes: { style: `min-height: ${minHeight}` },
    },
    onUpdate({ editor }) {
      const html = editor.getHTML();
      const value = html === "<p></p>" ? "" : html;
      if (hiddenRef.current) {
        hiddenRef.current.value = value;
      }
      onChange?.(value);
    },
  });

  return (
    <div className="mt-2 overflow-hidden rounded-md border border-input bg-card transition focus-within:border-ring/50 focus-within:ring-[3px] focus-within:ring-ring/30">
      {name ? (
        <input
          type="hidden"
          name={name}
          ref={hiddenRef}
          defaultValue={initial}
        />
      ) : null}
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}

type EditorInstance = NonNullable<ReturnType<typeof useEditor>>;

function Toolbar({ editor }: { editor: EditorInstance | null }) {
  if (!editor) return <div className="h-9 border-b border-stone-200 bg-stone-50" />;

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-stone-200 bg-stone-50 px-2 py-1.5">
      <Btn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Bold">
        <BoldIcon />
      </Btn>
      <Btn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Italic">
        <ItalicIcon />
      </Btn>
      <Btn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")} title="Strikethrough">
        <StrikeIcon />
      </Btn>

      <Sep />

      <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive("heading", { level: 1 })} title="Heading 1">
        <span className="text-[11px] font-bold leading-none">H1</span>
      </Btn>
      <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} title="Heading 2">
        <span className="text-[11px] font-bold leading-none">H2</span>
      </Btn>

      <Sep />

      <Btn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Bullet list">
        <BulletListIcon />
      </Btn>
      <Btn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Ordered list">
        <OrderedListIcon />
      </Btn>

      <Sep />

      <Btn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")} title="Blockquote">
        <BlockquoteIcon />
      </Btn>
    </div>
  );
}

function Btn({
  children,
  onClick,
  active,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={
        active
          ? "flex h-6 w-6 items-center justify-center rounded bg-zinc-900 text-white"
          : "flex h-6 w-6 items-center justify-center rounded text-stone-500 transition hover:bg-stone-200 hover:text-stone-800"
      }
    >
      {children}
    </button>
  );
}

function Sep() {
  return <div className="mx-0.5 h-4 w-px bg-stone-200" />;
}

function BoldIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M3 2.5h4a2.5 2.5 0 0 1 0 5H3V2.5z" fill="currentColor" />
      <path d="M3 7.5h4.5a2.5 2.5 0 0 1 0 5H3V7.5z" fill="currentColor" />
    </svg>
  );
}

function ItalicIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M8.5 1.5h-4M9 11.5H5M7.5 1.5 5.5 11.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function StrikeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <line x1="1" y1="6.5" x2="12" y2="6.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M4 4.5C4 3.1 4.9 2 6.5 2s2.5 1.1 2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M4 8.5C4 9.9 4.9 11 6.5 11S9 9.9 9 8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function BulletListIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <circle cx="2" cy="3.5" r="1" fill="currentColor" />
      <line x1="4.5" y1="3.5" x2="11.5" y2="3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="2" cy="6.5" r="1" fill="currentColor" />
      <line x1="4.5" y1="6.5" x2="11.5" y2="6.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="2" cy="9.5" r="1" fill="currentColor" />
      <line x1="4.5" y1="9.5" x2="11.5" y2="9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function OrderedListIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor">
      <text x="0.5" y="5" fontSize="4.5" fontFamily="monospace">1.</text>
      <line x1="4.5" y1="3.5" x2="11.5" y2="3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <text x="0.5" y="8" fontSize="4.5" fontFamily="monospace">2.</text>
      <line x1="4.5" y1="6.5" x2="11.5" y2="6.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <text x="0.5" y="11" fontSize="4.5" fontFamily="monospace">3.</text>
      <line x1="4.5" y1="9.5" x2="11.5" y2="9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function BlockquoteIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <rect x="1.5" y="2" width="1.5" height="9" rx="0.75" fill="currentColor" />
      <line x1="4.5" y1="4" x2="11.5" y2="4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="4.5" y1="6.5" x2="11.5" y2="6.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="4.5" y1="9" x2="9" y2="9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
