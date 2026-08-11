import "server-only";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Image storage.
 *
 * Google Cloud Storage in production - a GCP project and service account are
 * already mandatory for Vertex AI, so this adds no new vendor or credential
 * surface. On Cloud Run the attached service account authenticates via
 * Application Default Credentials, so no JSON key is ever needed.
 *
 * With FUSGUESSR_FAKE_IMAGE_PIPELINE=1 images are written under
 * public/generated instead, so the whole admin and play flow works locally
 * with no bucket.
 */

export interface StoredImage {
  url: string;
  gcsPath: string;
}

/** fusions/{fusionId}/{version}.png, with a raw/ prefix for pre-processed art. */
export function buildObjectPath(
  fusionId: string,
  version: number,
  variant: "final" | "raw" = "final",
): string {
  return variant === "raw"
    ? `fusions/${fusionId}/raw-${version}.png`
    : `fusions/${fusionId}/${version}.png`;
}

function isFakePipeline(): boolean {
  return process.env.FUSGUESSR_FAKE_IMAGE_PIPELINE === "1";
}

async function writeLocalPlaceholder(
  objectPath: string,
  image: Buffer,
): Promise<StoredImage> {
  // Nested under public/ so Next serves it without any bucket or signed URL.
  const relativePath = path.join("generated", objectPath.replace(/\//g, "_"));
  const absolutePath = path.join(process.cwd(), "public", relativePath);

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, image);

  return {
    url: `/${relativePath.split(path.sep).join("/")}`,
    gcsPath: objectPath,
  };
}

/**
 * Uploads a PNG and returns its public URL. The single seam the test suite
 * mocks - nothing else talks to GCS.
 */
export async function uploadFusionImage(
  objectPath: string,
  image: Buffer,
): Promise<StoredImage> {
  if (isFakePipeline()) {
    return writeLocalPlaceholder(objectPath, image);
  }

  const bucketName = process.env.GCS_BUCKET;
  if (!bucketName) {
    throw new Error(
      "GCS_BUCKET is not set. Set it, or set FUSGUESSR_FAKE_IMAGE_PIPELINE=1 " +
        "to develop without Cloud Storage.",
    );
  }

  const { Storage } = await import("@google-cloud/storage");
  const storage = new Storage();

  await storage
    .bucket(bucketName)
    .file(objectPath)
    .save(image, {
      contentType: "image/png",
      // Images are immutable: a regeneration writes a new version path
      // rather than overwriting, so they can be cached indefinitely.
      metadata: { cacheControl: "public, max-age=31536000, immutable" },
    });

  return {
    url: `https://storage.googleapis.com/${bucketName}/${objectPath}`,
    gcsPath: objectPath,
  };
}
