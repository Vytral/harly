/**
 * Lightweight Markdown → HTML renderer.
 * Covers: headings, bold, italic, strikethrough, links, lists, blockquotes,
 * code blocks, inline code, tables, horizontal rules, and paragraphs.
 * No external dependencies.
 */
export function renderMarkdown(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];
  let inTable = false;
  let tableRows: string[] = [];

  function flushTable() {
    if (!inTable || tableRows.length === 0) return;
    const header = tableRows[0];
    const body = tableRows.slice(2); // skip separator row
    const ths = header
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean)
      .map((c) => `<th class="border border-border px-3 py-1.5 text-left text-xs font-medium">${inline(c)}</th>`)
      .join("");
    const rows = body
      .map((row) => {
        const tds = row
          .split("|")
          .map((c) => c.trim())
          .filter(Boolean)
          .map((c) => `<td class="border border-border px-3 py-1.5 text-sm">${inline(c)}</td>`)
          .join("");
        return `<tr>${tds}</tr>`;
      })
      .join("");
    out.push(
      `<div class="my-4 overflow-x-auto"><table class="w-full border-collapse">${thead(ths)}<tbody>${rows}</tbody></table></div>`,
    );
    tableRows = [];
    inTable = false;
  }

  function thead(ths: string) {
    return `<thead><tr class="border-b border-border bg-muted/50">${ths}</tr></thead>`;
  }

  function inline(text: string): string {
    return text
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/~~(.+?)~~/g, "<del>$1</del>")
      .replace(
        /\[(.+?)\]\((.+?)\)/g,
        '<a href="$2" class="text-pine underline decoration-pine/30 underline-offset-2 hover:decoration-pine">$1</a>',
      )
      .replace(/`(.+?)`/g, '<code class="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">$1</code>');
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Fenced code blocks
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        out.push(
          `<pre class="my-4 overflow-x-auto rounded-lg border bg-muted/50 p-4 text-sm"><code>${codeBuffer.join("\n")}</code></pre>`,
        );
        codeBuffer = [];
        inCodeBlock = false;
      } else {
        flushTable();
        inCodeBlock = true;
      }
      continue;
    }
    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    // Table rows
    if (line.includes("|") && line.trim().startsWith("|")) {
      if (!inTable) {
        flushTable();
        inTable = true;
      }
      tableRows.push(line);
      continue;
    } else if (inTable) {
      flushTable();
    }

    // Empty line
    if (line.trim() === "") {
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      out.push('<hr class="my-6 border-border" />');
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const tag = `h${level}`;
      const cls =
        level === 1
          ? "text-2xl font-bold mt-8 mb-4"
          : level === 2
            ? "text-xl font-semibold mt-7 mb-3"
            : level === 3
              ? "text-lg font-semibold mt-6 mb-2"
              : "text-base font-semibold mt-5 mb-2";
      out.push(`<${tag} class="${cls}">${inline(headingMatch[2])}</${tag}>`);
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      out.push(
        `<blockquote class="my-3 border-l-2 border-pine/30 pl-4 text-muted-foreground italic">${inline(line.slice(2))}</blockquote>`,
      );
      continue;
    }

    // Unordered list
    if (/^[-*+]\s+/.test(line)) {
      out.push(
        `<li class="ml-6 my-1 list-disc text-sm leading-relaxed">${inline(line.replace(/^[-*+]\s+/, ""))}</li>`,
      );
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^(\d+)\.\s+(.+)$/);
    if (olMatch) {
      out.push(
        `<li class="ml-6 my-1 list-decimal text-sm leading-relaxed">${inline(olMatch[2])}</li>`,
      );
      continue;
    }

    // Paragraph
    out.push(
      `<p class="my-3 text-sm leading-relaxed">${inline(line)}</p>`,
    );
  }

  flushTable();

  return out.join("\n");
}
