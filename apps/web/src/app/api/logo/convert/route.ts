import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { db, organization } from "@harly/db";
import { auth } from "@/lib/auth";
import { storage } from "@/lib/storage";
import {
  convertLogoForEmail,
  needsEmailConversion,
  getRecommendedEmailFormat,
} from "@/lib/logo-convert";

export const runtime = "nodejs";

type ConvertLogoRequest = {
  logoUrl: string;
  organizationId: string;
};

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as ConvertLogoRequest;
  const { logoUrl, organizationId } = body;

  if (!logoUrl || !organizationId) {
    return NextResponse.json(
      { error: "logoUrl and organizationId are required." },
      { status: 400 },
    );
  }

  // Verify the user has access to this organization
  const [org] = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);

  if (!org) {
    return NextResponse.json({ error: "Organization not found." }, { status: 404 });
  }

  try {
    // Fetch the original logo
    const response = await fetch(logoUrl);
    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch logo." },
        { status: 400 },
      );
    }

    const contentType = response.headers.get("content-type") || "image/png";
    const buffer = Buffer.from(await response.arrayBuffer());

    // Check if conversion is needed
    if (!needsEmailConversion(contentType)) {
      // For raster images, just optimize them
      const format = getRecommendedEmailFormat(contentType);
      const converted = await convertLogoForEmail(buffer, contentType, {
        format,
        width: 400,
        height: 120,
        quality: 90,
      });

      // Upload the converted version
      const emailKey = `logos/${organizationId}/email.${converted.extension}`;
      const uploadResult = await storage.getPresignedUploadUrl({
        key: emailKey,
        contentType: converted.mimeType,
        contentLength: converted.buffer.length,
      });

      // Upload the actual file
      const putResponse = await fetch(uploadResult.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": converted.mimeType },
        body: new Uint8Array(converted.buffer).buffer,
      });

      if (!putResponse.ok) {
        return NextResponse.json(
          { error: "Failed to upload converted logo." },
          { status: 500 },
        );
      }

      // Update the organization with the email logo URL
      await db
        .update(organization)
        .set({ logoEmail: uploadResult.fileUrl })
        .where(eq(organization.id, organizationId));

      return NextResponse.json({
        success: true,
        logoEmailUrl: uploadResult.fileUrl,
        format: converted.extension,
      });
    }

    // For SVG, convert to PNG
    const converted = await convertLogoForEmail(buffer, contentType, {
      format: "png",
      width: 400,
      height: 120,
    });

    // Upload the converted version
    const emailKey = `logos/${organizationId}/email.png`;
    const uploadResult = await storage.getPresignedUploadUrl({
      key: emailKey,
      contentType: "image/png",
      contentLength: converted.buffer.length,
    });

    // Upload the actual file
    const putResponse = await fetch(uploadResult.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/png" },
      body: new Uint8Array(converted.buffer).buffer,
    });

    if (!putResponse.ok) {
      return NextResponse.json(
        { error: "Failed to upload converted logo." },
        { status: 500 },
      );
    }

    // Update the organization with the email logo URL
    await db
      .update(organization)
      .set({ logoEmail: uploadResult.fileUrl })
      .where(eq(organization.id, organizationId));

    return NextResponse.json({
      success: true,
      logoEmailUrl: uploadResult.fileUrl,
      format: "png",
    });
  } catch (error) {
    console.error("[Logo Convert] Error:", error);
    return NextResponse.json(
      { error: "Failed to convert logo." },
      { status: 500 },
    );
  }
}
