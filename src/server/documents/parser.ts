import path from "node:path";
import type { TextPage } from "./chunking.js";

export type ParsedDocument = {
  type: "pdf" | "markdown" | "text";
  pages: TextPage[];
};

export async function parseDocument(fileName: string, mimeType: string, buffer: Buffer): Promise<ParsedDocument> {
  const extension = path.extname(fileName).toLowerCase();

  if (extension === ".pdf" || mimeType === "application/pdf") {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useWorkerFetch: false,
      useSystemFonts: true,
    });
    const pdf = await loadingTask.promise;
    const pages: TextPage[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const text = textContent.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .trim();
      pages.push({ page: pageNumber, text });
    }
    await loadingTask.destroy();
    return { type: "pdf", pages };
  }

  if (extension === ".md" || extension === ".markdown" || mimeType === "text/markdown") {
    return { type: "markdown", pages: [{ page: 1, text: buffer.toString("utf8") }] };
  }

  if (extension === ".txt" || mimeType === "text/plain") {
    return { type: "text", pages: [{ page: 1, text: buffer.toString("utf8") }] };
  }

  throw new Error("仅支持 PDF、Markdown 和 TXT 文件");
}
