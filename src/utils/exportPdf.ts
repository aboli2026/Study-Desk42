import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { DrawingStroke, StickyNoteItem } from '../types';

export interface ExportAnnotatedPdfOptions {
  pdfData: ArrayBuffer;
  fileName: string;
  pageStrokes: Record<number, DrawingStroke[]>;
  stickyNotes: StickyNoteItem[];
}

/**
 * Parses color strings (hex, rgb, rgba) into normalized 0-1 values for pdf-lib rgb()
 */
function parseColorToRgb(colorStr: string) {
  if (!colorStr) return rgb(0.1, 0.1, 0.1);

  const clean = colorStr.trim().toLowerCase();

  // Hex colors #fff or #ffffff
  if (clean.startsWith('#')) {
    let hex = clean.slice(1);
    if (hex.length === 3) {
      hex = hex.split('').map((c) => c + c).join('');
    }
    if (hex.length >= 6) {
      const r = parseInt(hex.substring(0, 2), 16) / 255;
      const g = parseInt(hex.substring(2, 4), 16) / 255;
      const b = parseInt(hex.substring(4, 6), 16) / 255;
      return rgb(
        isNaN(r) ? 0 : Math.max(0, Math.min(1, r)),
        isNaN(g) ? 0 : Math.max(0, Math.min(1, g)),
        isNaN(b) ? 0 : Math.max(0, Math.min(1, b))
      );
    }
  }

  // rgb/rgba string
  const rgbMatch = clean.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10) / 255;
    const g = parseInt(rgbMatch[2], 10) / 255;
    const b = parseInt(rgbMatch[3], 10) / 255;
    return rgb(
      isNaN(r) ? 0 : Math.max(0, Math.min(1, r)),
      isNaN(g) ? 0 : Math.max(0, Math.min(1, g)),
      isNaN(b) ? 0 : Math.max(0, Math.min(1, b))
    );
  }

  // Fallback dark color
  return rgb(0.15, 0.15, 0.15);
}

/**
 * Bakes canvas drawings (pens, highlighters, ruler lines) and sticky notes directly into
 * a downloadable PDF file using pdf-lib.
 */
export async function exportAnnotatedPdf(options: ExportAnnotatedPdfOptions): Promise<void> {
  const { pdfData, fileName, pageStrokes, stickyNotes } = options;

  if (!pdfData || pdfData.byteLength === 0) {
    throw new Error('فایل PDF نامعتبر است یا داده‌ای وجود ندارد.');
  }

  // Load existing PDF
  const pdfDoc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();

  let helveticaFont;
  try {
    helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  } catch {
    // Optional fallback
  }

  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const pageNumber = pageIdx + 1;
    const page = pages[pageIdx];
    const { width, height } = page.getSize();

    // 1. Draw strokes (pen, highlighter, ruler)
    const strokes = pageStrokes[pageNumber] || [];
    for (const stroke of strokes) {
      if (!stroke.points || stroke.points.length < 2) continue;

      const isHighlighter = stroke.tool === 'highlighter';
      const strokeColor = parseColorToRgb(stroke.color);
      const strokeOpacity =
        stroke.opacity !== undefined
          ? stroke.opacity
          : isHighlighter
          ? 0.45
          : 1.0;
      const thickness = stroke.width || (isHighlighter ? 18 : 2.5);

      for (let i = 0; i < stroke.points.length - 1; i++) {
        const p1 = stroke.points[i];
        const p2 = stroke.points[i + 1];

        // Canvas Y is top-down (0 = top), PDF Y is bottom-up (0 = bottom)
        const startY = Math.max(0, Math.min(height, height - p1.y));
        const endY = Math.max(0, Math.min(height, height - p2.y));
        const startX = Math.max(0, Math.min(width, p1.x));
        const endX = Math.max(0, Math.min(width, p2.x));

        page.drawLine({
          start: { x: startX, y: startY },
          end: { x: endX, y: endY },
          thickness,
          color: strokeColor,
          opacity: strokeOpacity,
        });
      }
    }

    // 2. Render Sticky Notes for this page
    const notesForPage = (stickyNotes || []).filter((n) => n.pageNumber === pageNumber);
    for (const note of notesForPage) {
      const noteX = Math.max(10, Math.min(width - 150, note.x));
      const noteY = Math.max(10, Math.min(height - 70, height - note.y - 60));
      const boxWidth = 140;
      const boxHeight = 55;

      const noteBg = parseColorToRgb(note.color || '#fef08a');
      const noteBorder = rgb(0.85, 0.75, 0.2);

      // Draw Sticky Note background card
      page.drawRectangle({
        x: noteX,
        y: noteY,
        width: boxWidth,
        height: boxHeight,
        color: noteBg,
        borderColor: noteBorder,
        borderWidth: 1,
        opacity: 0.95,
      });

      // Note Header marker
      page.drawRectangle({
        x: noteX,
        y: noteY + boxHeight - 12,
        width: boxWidth,
        height: 12,
        color: noteBorder,
        opacity: 0.4,
      });

      // Text summary (if font available)
      if (helveticaFont && note.title) {
        try {
          const asciiTitle = note.title.replace(/[^\x20-\x7E]/g, '?').slice(0, 18);
          page.drawText(asciiTitle, {
            x: noteX + 6,
            y: noteY + boxHeight - 24,
            size: 9,
            font: helveticaFont,
            color: rgb(0.2, 0.2, 0.2),
          });
        } catch {
          // ignore character set limitations
        }
      }
    }
  }

  // Generate downloadable blob
  const modifiedPdfBytes = await pdfDoc.save();
  const blob = new Blob([modifiedPdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  const downloadUrl = URL.createObjectURL(blob);

  const cleanName = fileName?.endsWith('.pdf') ? fileName : `${fileName || 'Study-Document'}.pdf`;
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = cleanName;
  document.body.appendChild(link);
  link.click();

  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);
  }, 2000);
}
