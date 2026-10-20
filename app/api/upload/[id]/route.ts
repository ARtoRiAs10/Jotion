import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { uploadDirectory } from "@/lib/upload-dir";

export const runtime = "nodejs";

/**
 * Serves files that were uploaded through the local storage fallback.
 */
export const GET = async (
  _request: Request,
  { params }: { params: { id: string } },
) => {
  try {
    const filePath = path.join(uploadDirectory(), path.basename(params.id));
    const file = await readFile(filePath);

    return new NextResponse(file, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
};
