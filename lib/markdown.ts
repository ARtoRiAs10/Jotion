/**
 * A small Markdown → BlockNote converter.
 *
 * It supports the subset of Markdown that people actually paste into
 * Notion: headings, paragraphs, bullet and numbered lists, to-do lists,
 * quotes, code fences, dividers, tables (as paragraphs) and the usual inline
 * marks (**bold**, *italic*, `code`, [links](url)).
 */

export type InlineStyle = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  link?: string;
};

export type ConvertedBlock = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: { type: string; text?: string; styles?: Record<string, boolean> }[];
};

const INLINE_PATTERN =
  /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;

/** Splits a line of Markdown into styled text runs. */
export const parseInline = (line: string): InlineStyle[] => {
  const parts = line.split(INLINE_PATTERN).filter((part) => part !== "");
  const styles: InlineStyle[] = [];

  for (const part of parts) {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      styles.push({ text: part.slice(2, -2), bold: true });
    } else if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      styles.push({ text: part.slice(1, -1), italic: true });
    } else if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      styles.push({ text: part.slice(1, -1), code: true });
    } else if (part.startsWith("[") && part.includes("](")) {
      const label = part.slice(1, part.indexOf("]("));
      const url = part.slice(part.indexOf("](") + 2, -1);
      styles.push({ text: label, link: url });
    } else {
      styles.push({ text: part });
    }
  }

  return styles.length > 0 ? styles : [{ text: "" }];
};

/** Converts inline styles into the BlockNote content format. */
export const toBlockContent = (styles: InlineStyle[]) =>
  styles.map((style) => {
    const marks: Record<string, boolean> = {};
    if (style.bold) marks.bold = true;
    if (style.italic) marks.italic = true;
    if (style.code) marks.code = true;

    return {
      type: "text",
      text: style.text,
      ...(Object.keys(marks).length > 0 ? { styles: marks } : {}),
      ...(style.link ? { href: style.link } : {}),
    };
  });

/**
 * Converts a Markdown document into BlockNote blocks.
 */
export const markdownToBlocks = (markdown: string): ConvertedBlock[] => {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: ConvertedBlock[] = [];

  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    // Code fence
    if (trimmed.startsWith("```")) {
      const language = trimmed.slice(3).trim();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push({
        type: "codeBlock",
        attrs: { language: language || "text" },
        content: [{ type: "text", text: code.join("\n") }],
      });
      continue;
    }

    // Divider
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ type: "divider", content: [{ type: "text", text: "" }] });
      index += 1;
      continue;
    }

    // Heading
    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      blocks.push({
        type: "heading",
        attrs: { level: heading[1].length },
        content: toBlockContent(parseInline(heading[2])),
      });
      index += 1;
      continue;
    }

    // Quote
    if (trimmed.startsWith(">")) {
      blocks.push({
        type: "quote",
        content: toBlockContent(parseInline(trimmed.replace(/^>\s?/, ""))),
      });
      index += 1;
      continue;
    }

    // To-do list
    const todo = /^[-*]\s+\[([ xX])\]\s+(.*)$/.exec(trimmed);
    if (todo) {
      blocks.push({
        type: "toDoItem",
        attrs: { checked: todo[1].toLowerCase() === "x" },
        content: toBlockContent(parseInline(todo[2])),
      });
      index += 1;
      continue;
    }

    // Bullet list
    if (/^[-*]\s+/.test(trimmed)) {
      blocks.push({
        type: "bulletListItem",
        content: toBlockContent(parseInline(trimmed.replace(/^[-*]\s+/, ""))),
      });
      index += 1;
      continue;
    }

    // Numbered list
    if (/^\d+[.)]\s+/.test(trimmed)) {
      blocks.push({
        type: "numberedListItem",
        content: toBlockContent(
          parseInline(trimmed.replace(/^\d+[.)]\s+/, "")),
        ),
      });
      index += 1;
      continue;
    }

    // Blank line
    if (trimmed === "") {
      index += 1;
      continue;
    }

    // Paragraph (consecutive lines are joined)
    const paragraph: string[] = [trimmed];
    index += 1;
    while (index < lines.length) {
      const next = lines[index].trim();
      if (
        next === "" ||
        next.startsWith("#") ||
        next.startsWith("```") ||
        next.startsWith(">") ||
        /^[-*]\s+/.test(next) ||
        /^\d+[.)]\s+/.test(next)
      ) {
        break;
      }
      paragraph.push(next);
      index += 1;
    }

    blocks.push({
      type: "paragraph",
      content: toBlockContent(parseInline(paragraph.join(" "))),
    });
  }

  return blocks;
};

/** The title of a Markdown document — the first `# heading`. */
export const titleFromMarkdown = (markdown: string) => {
  const match = /^#\s+(.+)$/m.exec(markdown);
  return match ? match[1].trim() : "";
};

/** Blocks back into Markdown — used by the export. */
export const blocksToMarkdown = (blocks: unknown[]): string => {
  if (!Array.isArray(blocks)) return "";

  const text = (block: { content?: { text?: string }[] }) =>
    (block.content ?? []).map((part) => part.text ?? "").join("");

  return blocks
    .map((block) => {
      const typed = block as {
        type?: string;
        attrs?: { level?: number; checked?: boolean };
        content?: { text?: string }[];
      };
      switch (typed.type) {
        case "heading":
          return `${"#".repeat(typed.attrs?.level ?? 1)} ${text(typed)}`;
        case "bulletListItem":
          return `- ${text(typed)}`;
        case "numberedListItem":
          return `1. ${text(typed)}`;
        case "toDoItem":
          return `- [${typed.attrs?.checked ? "x" : " "}] ${text(typed)}`;
        case "quote":
          return `> ${text(typed)}`;
        case "codeBlock":
          return "```\n" + text(typed) + "\n```";
        case "divider":
          return "---";
        default:
          return text(typed);
      }
    })
    .join("\n\n");
};
