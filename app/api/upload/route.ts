import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { uploadDirectory } from "@/lib/upload-dir";

export const runtime = "nodejs";

/** Hard cap for a single upload (the per plan limit is enforced in the UI). */
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

/**
 * Local file storage used when Edge Store is not configured.
 */
export const POST = async (request: Request) => {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "This file is too large" },
        { status: 413 },
      );
    }

    const uploadDir = uploadDirectory();
    await mkdir(uploadDir, { recursive: true });

    const extension = path.extname(file.name) || "";
    const id = `${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 10)}${extension}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(uploadDir, id), buffer);

    return NextResponse.json({ url: `/api/upload/${id}` });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 },
    );
  }
};
