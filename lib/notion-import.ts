/**
 * Turns a Notion export (a ZIP file) into a structure the backend can
 * import.
 *
 * A Notion export looks like this:
 *
 *   Export-1234/
 *     My workspace/
 *       Getting started.md
 *       Getting started/
 *         Sub page.md
 *       Projects/
 *         Projects.csv
 *         <id>.csv
 *
 * Every `.md` file becomes a page (the directory structure becomes the page
 * tree) and every `.csv` file becomes a database.
 */

export interface NotionImportPage {
  title: string;
  /** The Markdown content of the page. */
  content: string;
  children?: NotionImportPage[];
}

export interface NotionImportDatabase {
  title: string;
  /** The column names of the CSV file, in order. */
  columns: string[];
  /** The rows of the CSV file. */
  rows: string[][];
  children?: NotionImportPage[];
}

export interface NotionImportTree {
  pages: NotionImportPage[];
  databases: NotionImportDatabase[];
}

interface ArchiveFile {
  path: string;
  name?: string;
  read: () => Promise<Uint8Array>;
}

/** The file name of an archive entry (the last segment of its path). */
const fileName = (file: ArchiveFile) =>
  file.name ?? file.path.split("/").pop() ?? file.path;

const decode = async (file: ArchiveFile) =>
  new TextDecoder("utf-8").decode(await file.read());

/** Splits a CSV line, honouring quotes. */
export const parseCsvLine = (line: string): string[] => {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
};

/** Parses a whole CSV document into rows of cells. */
export const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let current = "";
  let quoted = false;

  const pushRow = () => {
    const line = current.replace(/\r$/, "");
    current = "";
    if (line.trim() === "") return;
    const cells = parseCsvLine(line);
    if (cells.some((cell) => cell !== "")) rows.push(cells);
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        current += '""';
        index += 1;
      } else {
        quoted = !quoted;
        current += char;
      }
    } else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      pushRow();
    } else {
      current += char;
    }
  }
  pushRow();

  return rows;
};

/**
 * Builds the page/database tree of a Notion export.
 *
 * A page is a `.md` file, optionally with a folder of the same name that
 * holds its children. A database is a folder with a `.csv` file of the same
 * name.
 */
export const buildImportTree = async (
  files: ArchiveFile[],
): Promise<NotionImportTree> => {
  // Group the files by their directory.
  const byDirectory = new Map<string, ArchiveFile[]>();
  for (const file of files) {
    const parts = file.path.split("/");
    // The first part is the export folder, the second the workspace.
    if (parts.length < 3) continue;
    const directory = parts.slice(0, -1).join("/");
    const list = byDirectory.get(directory) ?? [];
    list.push(file);
    byDirectory.set(directory, list);
  }

  const filesIn = (directory: string) => byDirectory.get(directory) ?? [];

  /** The immediate children (files and folders) of a directory. */
  const childrenOf = (directory: string): string[] => {
    const names = new Set<string>();

    for (const file of filesIn(directory)) {
      names.add(fileName(file).replace(/\.(md|csv)$/, ""));
    }

    const prefix = `${directory}/`;
    for (const key of Array.from(byDirectory.keys())) {
      if (!key.startsWith(prefix)) continue;
      // The first segment is the name of the immediate child.
      const rest = key.slice(prefix.length);
      if (!rest) continue;
      names.add(rest.split("/")[0]);
    }

    return Array.from(names);
  };

  const process = async (
    directory: string,
    /** True when the directory is the folder of a database. */
    insideDatabase = false,
  ): Promise<{ pages: NotionImportPage[]; databases: NotionImportDatabase[] }> => {
    const pages: NotionImportPage[] = [];
    const databases: NotionImportDatabase[] = [];

    for (const name of childrenOf(directory)) {
      const childDirectory = `${directory}/${name}`;

      const markdown =
        filesIn(childDirectory).find(
          (file) => fileName(file) === `${name}.md`,
        ) ??
        filesIn(directory).find((file) => fileName(file) === `${name}.md`);
      // A database always lives in its own folder — the CSV of the folder
      // itself must not be imported twice.
      const csv =
        filesIn(childDirectory).find(
          (file) => fileName(file) === `${name}.csv`,
        ) ??
        (insideDatabase
          ? undefined
          : filesIn(directory).find((file) => fileName(file) === `${name}.csv`));

      if (markdown) {
        const children = await process(childDirectory);
        pages.push({
          title: name,
          content: await decode(markdown),
          children: children.pages,
        });
        databases.push(...children.databases);
        continue;
      }

      if (csv) {
        const rows = parseCsv(await decode(csv));
        const children = await process(childDirectory, true);
        databases.push({
          title: name,
          columns: rows[0] ?? [],
          rows: rows.slice(1),
          children: children.pages,
        });
        databases.push(...children.databases);
      }
    }

    return { pages, databases };
  };

  // The root of the workspace — one level below the export folder.
  const roots = new Set(
    Array.from(byDirectory.keys()).map((directory) =>
      directory.split("/").slice(0, 2).join("/"),
    ),
  );

  const pages: NotionImportPage[] = [];
  const databases: NotionImportDatabase[] = [];

  for (const root of Array.from(roots)) {
    const result = await process(root);
    pages.push(...result.pages);
    databases.push(...result.databases);
  }

  return { pages, databases };
};
