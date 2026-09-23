/**
 * Extract policy text locally. Only the resulting text reaches the scan API;
 * neither the uploaded file nor its bytes are stored on the server.
 */
export async function extractPolicyDocumentText(file) {
  const extension = file.name.toLowerCase().match(/\.[^.]+$/)?.[0];
  let text;

  if (extension === ".pdf") {
    const [{ getDocument, GlobalWorkerOptions }, worker] = await Promise.all([
      import("pdfjs-dist/build/pdf.mjs"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
    ]);
    GlobalWorkerOptions.workerSrc = worker.default;
    let loadingTask;
    try {
      loadingTask = getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
      const document = await loadingTask.promise;
      const pages = [];
      for (let number = 1; number <= document.numPages; number++) {
        const page = await document.getPage(number);
        const content = await page.getTextContent();
        pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
        page.cleanup();
      }
      text = pages.join("\n");
    } catch (error) {
      throw new Error("Could not read this PDF. Check that it is a valid, unlocked PDF.", { cause: error });
    } finally {
      await loadingTask?.destroy();
    }
  } else if (extension === ".docx") {
    try {
      const mammoth = await import("mammoth");
      const bytes = await file.arrayBuffer();
      // Mammoth's browser and Node builds use different binary input keys.
      const input = typeof window === "undefined"
        ? { buffer: Buffer.from(bytes) }
        : { arrayBuffer: bytes };
      const extracted = await mammoth.extractRawText(input);
      text = extracted.value;
    } catch (error) {
      throw new Error("Could not read this DOCX. Check that it is a valid, unlocked Word document.", { cause: error });
    }
  } else if (extension === ".txt" || extension === ".md") {
    text = await file.text();
  } else if (extension === ".doc") {
    throw new Error("Older .doc files cannot be read here. Save as .docx, PDF, or plain text and try again.");
  } else {
    throw new Error("Choose a PDF, DOCX, TXT, or MD file.");
  }

  if (!text?.trim()) {
    throw new Error(
      extension === ".pdf"
        ? "This PDF has no selectable text. Run OCR or upload a text-based PDF before scanning."
        : "No readable text was found in this file. Check that the document contains text.",
    );
  }
  return text.trim();
}