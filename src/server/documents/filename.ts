const EAST_ASIAN_CHARACTER = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/g;

function countMatches(value: string, pattern: RegExp): number {
  return value.match(pattern)?.length || 0;
}

/**
 * Browsers send multipart filenames as UTF-8 bytes, while some Node multipart
 * parsers expose the header value as Latin-1. Decode only when doing so
 * produces valid UTF-8 and clearly restores East Asian characters, so an
 * already-correct Unicode or legitimate Latin filename is left untouched.
 */
export function normalizeUploadFilename(fileName: string): string {
  if (!fileName) return fileName;
  const decoded = Buffer.from(fileName, "latin1").toString("utf8");
  if (decoded === fileName || decoded.includes("\uFFFD")) return fileName;

  const originalEastAsianCount = countMatches(fileName, EAST_ASIAN_CHARACTER);
  const decodedEastAsianCount = countMatches(decoded, EAST_ASIAN_CHARACTER);
  return decodedEastAsianCount > originalEastAsianCount ? decoded : fileName;
}
