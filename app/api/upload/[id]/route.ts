import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const UPLOAD_DIR = path.join(process.cwd(), ".jotion-uploads");

/**
 * Serves files that were uploaded through the local storage fallback.
 */
export const GET = async (
  _request: Request,
  { params }: { params: { id: string } },
) => {
  try {
    const filePath = path.join(UPLOAD_DIR, path.basename(params.id));
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
