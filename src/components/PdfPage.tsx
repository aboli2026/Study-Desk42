import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { Loader2, StickyNote, Move, Trash2, Pencil, Eraser, Crosshair, Image as ImageIcon } from 'lucide-react';
import { DrawingStroke, StickyNoteItem, EyeComfortSettings } from '../types';

// Distance from point to line segment
function distanceToSegment(
  p: { x: number; y: number },
  v: { x: number; y: number },
  w: { x: number; y: number }
): number {
  const l2 = (v.x - w.x) * (v.x - w.x) + (v.y - w.y) * (v.y - w.y);
  if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
}

// Hit-test stroke with tolerance
function hitTestStroke(
  point: { x: number; y: number },
  stroke: DrawingStroke,
  tolerance: number = 10
): boolean {
  if (!stroke.points || stroke.points.length === 0) return false;
  const hitDist = Math.max(12, (stroke.width || 4) / 2 + tolerance);

  if (stroke.points.length === 1) {
    return Math.hypot(point.x - stroke.points[0].x, point.y - stroke.points[0].y) <= hitDist;
  }

  // Fast bounding box check with padding
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const pt of stroke.points) {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }
  if (
    point.x < minX - hitDist ||
    point.x > maxX + hitDist ||
    point.y < minY - hitDist ||
    point.y > maxY + hitDist
  ) {
    return false;
  }

  // Segment distance check
  for (let i = 0; i < stroke.points.length - 1; i++) {
    if (distanceToSegment(point, stroke.points[i], stroke.points[i + 1]) <= hitDist) {
      return true;
    }
  }
  return false;
}

// Compute stroke bounding box
function getStrokeBBox(stroke: DrawingStroke) {
  if (!stroke.points || stroke.points.length === 0) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of stroke.points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const pad = Math.max(8, (stroke.width || 4) / 2 + 5);
  return {
    minX: minX - pad,
    maxX: maxX + pad,
    minY: minY - pad,
    maxY: maxY + pad,
    width: Math.max(24, maxX - minX + pad * 2),
    height: Math.max(24, maxY - minY + pad * 2),
  };
}

// Parse hex or rgb string into numeric components
function parseColorToRgb(color: string): { r: number; g: number; b: number } | null {
  if (!color) return null;
  const s = color.trim().toLowerCase();
  if (s.startsWith('#')) {
    let hex = s.slice(1);
    if (hex.length === 3) {
      hex = hex.split('').map((c) => c + c).join('');
    }
    if (hex.length >= 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return { r, g, b };
    }
  }
  const rgbMatch = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1], 10),
      g: parseInt(rgbMatch[2], 10),
      b: parseInt(rgbMatch[3], 10),
    };
  }
  return null;
}

/**
 * Intelligently adapts pen and ruler stroke colors in Dark Mode so they never disappear
 * or mutate into dark mud, while preserving the user's authentic palette identity.
 */
export function getAdaptiveStrokeColor(color: string, isDarkMode: boolean): string {
  if (!color) return isDarkMode ? '#f3f4f6' : '#171717';
  const lower = color.trim().toLowerCase();

  if (isDarkMode) {
    // 1. Black or near-black strokes adapt to crisp, readable off-white
    if (
      lower === '#171717' ||
      lower === '#000000' ||
      lower === '#111827' ||
      lower === '#1f2937' ||
      lower === '#0f172a' ||
      lower === '#262626' ||
      lower === '#333333'
    ) {
      return '#f3f4f6';
    }

    // 2. High-contrast vivid mappings for standard palette colors
    if (lower === '#2563eb' || lower === '#1d4ed8' || lower === '#1e40af' || lower === '#1e3a8a') {
      return '#60a5fa'; // Bright sky blue
    }
    if (lower === '#16a34a' || lower === '#15803d' || lower === '#166534' || lower === '#14532d') {
      return '#4ade80'; // Bright emerald green
    }
    if (lower === '#ef4444' || lower === '#dc2626' || lower === '#b91c1c' || lower === '#991b1b') {
      return '#f87171'; // Bright coral red
    }
    if (lower === '#9333ea' || lower === '#7e22ce' || lower === '#6b21a8' || lower === '#581c87') {
      return '#c084fc'; // Bright lavender purple
    }
    if (lower === '#d97706' || lower === '#b45309' || lower === '#92400e' || lower === '#78350f') {
      return '#fbbf24'; // Bright amber gold
    }

    // 3. For custom colors: ensure adequate contrast against dark background
    const rgb = parseColorToRgb(lower);
    if (rgb) {
      const lum = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
      if (lum < 0.22) {
        return '#f3f4f6';
      }
      if (lum < 0.38) {
        const maxVal = Math.max(rgb.r, rgb.g, rgb.b);
        if (maxVal === 0) return '#f3f4f6';
        const factor = 190 / maxVal;
        const newR = Math.min(255, Math.round(rgb.r * factor + 35));
        const newG = Math.min(255, Math.round(rgb.g * factor + 35));
        const newB = Math.min(255, Math.round(rgb.b * factor + 35));
        return `rgb(${newR}, ${newG}, ${newB})`;
      }
    }
    return color;
  } else {
    // In Light Mode (White / Swedish paper):
    // Pure white strokes (drawn in night mode) adapt to dark gray so they don't vanish on white paper
    if (lower === '#ffffff' || lower === '#fefefe' || lower === '#fafafa' || lower === '#f5f5f5') {
      return '#171717';
    }
    return color;
  }
}

interface PdfPageProps {
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  onVisible: (pageNumber: number) => void;
  activeTool: 'hand' | 'select' | 'pen' | 'highlighter' | 'ruler' | 'eraser' | 'sticky-note';
  eraserMode?: 'area' | 'object';
  eraserSize?: number;
  onClearPageAnnotations?: (pageNumber: number) => void;
  rulerColor?: string;
  rulerWidth?: number;
  rulerLock90?: boolean;
  selectedItem?: { type: 'note' | 'stroke'; id: string; pageNumber: number } | null;
  onSelectItem?: (item: { type: 'note' | 'stroke'; id: string; pageNumber: number } | null) => void;
  penColor: string;
  penWidth: number;
  highlighterColor: string;
  highlighterWidth: number;
  autoStraighten: boolean;
  strokes?: DrawingStroke[];
  onAddStroke?: (pageNumber: number, stroke: DrawingStroke) => void;
  onUpdateStroke?: (pageNumber: number, strokeId: string, updatedStroke: DrawingStroke) => void;
  onDeleteStroke?: (pageNumber: number, strokeId: string) => void;
  onDeleteStrokes?: (pageNumber: number, strokeIds: string[]) => void;
  stickyNotes?: StickyNoteItem[];
  onAddStickyNote?: (pageNumber: number, x: number, y: number) => void;
  onMoveStickyNote?: (noteId: string, pageNumber: number, newX: number, newY: number) => void;
  onDeleteStickyNote?: (noteId: string) => void;
  onOpenStickyNote?: (note: StickyNoteItem) => void;
  eyeComfortSettings?: EyeComfortSettings;
  isFitMode?: boolean;
}

const PdfPageComponent: React.FC<PdfPageProps> = ({
  pdfDoc,
  pageNumber,
  scale,
  onVisible,
  activeTool,
  eraserMode = 'area',
  eraserSize = 28,
  selectedItem = null,
  onSelectItem,
  penColor,
  penWidth,
  highlighterColor,
  highlighterWidth,
  autoStraighten,
  rulerColor = '#2563eb',
  rulerWidth = 2.5,
  rulerLock90 = false,
  strokes = [],
  onAddStroke,
  onUpdateStroke,
  onDeleteStroke,
  onDeleteStrokes,
  stickyNotes = [],
  onAddStickyNote,
  onMoveStickyNote,
  onDeleteStickyNote,
  onOpenStickyNote,
  eyeComfortSettings,
  isFitMode = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const highlighterCanvasRef = useRef<HTMLCanvasElement>(null);
  const inkCanvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);

  const colorMode = eyeComfortSettings?.colorMode || 'normal';
  const isDarkMode = colorMode === 'dark-gray';

  const isDrawingRef = useRef<boolean>(false);
  const currentPointsRef = useRef<{ x: number; y: number }[]>([]);

  // Dragging Stroke State
  const dragStrokeRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    originalPoints: { x: number; y: number }[];
    hasMoved: boolean;
  } | null>(null);
  const [isDraggingStroke, setIsDraggingStroke] = useState<boolean>(false);
  const [isHoveringStroke, setIsHoveringStroke] = useState<boolean>(false);
  const [dragStrokeOffset, setDragStrokeOffset] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const rafStrokeRef = useRef<number | null>(null);

  // Dragging Sticky Note State
  const dragNoteRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    hasMoved: boolean;
  } | null>(null);
  const [draggingNoteId, setDraggingNoteId] = useState<string | null>(null);
  const [dragNoteOffset, setDragNoteOffset] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const rafNoteRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (rafNoteRef.current) cancelAnimationFrame(rafNoteRef.current);
      if (rafStrokeRef.current) cancelAnimationFrame(rafStrokeRef.current);
    };
  }, []);

  const [isInViewport, setIsInViewport] = useState<boolean>(pageNumber <= 3); // Pre-load first 3 pages
  const [isRendered, setIsRendered] = useState<boolean>(false);
  const [pageWidth, setPageWidth] = useState<number>(600);
  const [pageHeight, setPageHeight] = useState<number>(850);

  // Selected stroke on this page
  const isCurrentStrokeSelected =
    selectedItem?.type === 'stroke' &&
    selectedItem.pageNumber === pageNumber &&
    Boolean(selectedItem.id);

  const selectedStroke = useMemo(() => {
    if (!isCurrentStrokeSelected) return null;
    return strokes.find((s) => s.id === selectedItem?.id) || null;
  }, [isCurrentStrokeSelected, strokes, selectedItem?.id]);

  const strokeBBox = useMemo(() => {
    if (!selectedStroke) return null;
    return getStrokeBBox(selectedStroke);
  }, [selectedStroke]);

  // Measure initial aspect ratio from the page
  useEffect(() => {
    let active = true;
    pdfDoc.getPage(pageNumber).then((page) => {
      if (!active) return;
      const viewport = page.getViewport({ scale });
      setPageWidth(viewport.width);
      setPageHeight(viewport.height);
    }).catch(() => {});

    return () => {
      active = false;
    };
  }, [pdfDoc, pageNumber, scale]);

  // IntersectionObserver for rendering when near viewport
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Observer 1: Render when within 800px of viewport
    const renderObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          setIsInViewport(true);
        }
      },
      { rootMargin: '800px 0px 800px 0px' }
    );

    // Observer 2: Update current visible page indicator in toolbar
    const visibilityObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && entry.intersectionRatio >= 0.4) {
          onVisible(pageNumber);
        }
      },
      { threshold: [0.4, 0.7] }
    );

    renderObserver.observe(container);
    visibilityObserver.observe(container);

    return () => {
      renderObserver.disconnect();
      visibilityObserver.disconnect();
    };
  }, [pageNumber, onVisible]);

  // Render page when in viewport
  useEffect(() => {
    if (!isInViewport || !canvasRef.current) return;

    let isCancelled = false;

    const render = async () => {
      try {
        // Cancel any pending render task on this page
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
          renderTaskRef.current = null;
        }

        const page = await pdfDoc.getPage(pageNumber);
        if (isCancelled || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) return;

        // Sharp rendering with pixel ratio
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale });

        setPageWidth(viewport.width);
        setPageHeight(viewport.height);

        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        context.setTransform(dpr, 0, 0, dpr, 0, 0);

        // White background
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, viewport.width, viewport.height);

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
          canvas: canvas,
        };

        const renderTask = page.render(renderContext);
        renderTaskRef.current = renderTask;

        await renderTask.promise;
        if (!isCancelled) {
          setIsRendered(true);
        }
      } catch (err: unknown) {
        // Ignore cancel errors
        const error = err as { name?: string };
        if (error?.name !== 'RenderingCancelledException') {
          console.error(`Page ${pageNumber} render failed:`, err);
        }
      }
    };

    render();

    return () => {
      isCancelled = true;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
    };
  }, [isInViewport, pdfDoc, pageNumber, scale]);

  // Redraw all strokes whenever strokes, scale, dimensions, or reading theme changes
  const redrawStrokes = useCallback(() => {
    // 1. Highlighters layer (translucent fluorescent dyes)
    const hlCanvas = highlighterCanvasRef.current;
    if (hlCanvas) {
      const hlCtx = hlCanvas.getContext('2d');
      if (hlCtx) {
        hlCtx.clearRect(0, 0, hlCanvas.width, hlCanvas.height);
        if (strokes && strokes.length > 0) {
          const highlighters = strokes.filter((s) => s.tool === 'highlighter');
          highlighters.forEach((stroke) => {
            if (!stroke.points || stroke.points.length === 0) return;
            hlCtx.save();
            // In dark mode screen blend, alpha is tuned to preserve radiant glowing highlighter color
            hlCtx.globalAlpha = isDarkMode
              ? Math.min(0.68, (stroke.opacity || 0.52) * 1.1)
              : (stroke.opacity || 0.52);
            hlCtx.globalCompositeOperation = 'source-over';
            hlCtx.lineCap = 'square';
            hlCtx.lineJoin = 'bevel';
            hlCtx.beginPath();
            hlCtx.strokeStyle = stroke.color;
            hlCtx.lineWidth = stroke.width * scale;

            const offX = dragStrokeOffset && dragStrokeOffset.id === stroke.id ? dragStrokeOffset.dx * scale : 0;
            const offY = dragStrokeOffset && dragStrokeOffset.id === stroke.id ? dragStrokeOffset.dy * scale : 0;

            hlCtx.moveTo(stroke.points[0].x * scale + offX, stroke.points[0].y * scale + offY);
            for (let i = 1; i < stroke.points.length; i++) {
              hlCtx.lineTo(stroke.points[i].x * scale + offX, stroke.points[i].y * scale + offY);
            }
            hlCtx.stroke();
            hlCtx.restore();
          });
        }
      }
    }

    // 2. Ink layer for pen & ruler (crisp solid ink)
    const inkCanvas = inkCanvasRef.current;
    if (inkCanvas) {
      const inkCtx = inkCanvas.getContext('2d');
      if (inkCtx) {
        inkCtx.clearRect(0, 0, inkCanvas.width, inkCanvas.height);
        if (strokes && strokes.length > 0) {
          const inkStrokes = strokes.filter((s) => s.tool !== 'highlighter');
          inkStrokes.forEach((stroke) => {
            if (!stroke.points || stroke.points.length === 0) return;
            inkCtx.save();
            inkCtx.globalAlpha = 1.0;
            inkCtx.globalCompositeOperation = 'source-over';
            inkCtx.lineCap = 'round';
            inkCtx.lineJoin = 'round';
            inkCtx.beginPath();
            // Intelligently adapt stroke color: black notes become white in dark mode, dark blues become sky blue, etc.
            inkCtx.strokeStyle = getAdaptiveStrokeColor(stroke.color, isDarkMode);
            inkCtx.lineWidth = stroke.width * scale;

            const offX = dragStrokeOffset && dragStrokeOffset.id === stroke.id ? dragStrokeOffset.dx * scale : 0;
            const offY = dragStrokeOffset && dragStrokeOffset.id === stroke.id ? dragStrokeOffset.dy * scale : 0;

            inkCtx.moveTo(stroke.points[0].x * scale + offX, stroke.points[0].y * scale + offY);
            for (let i = 1; i < stroke.points.length; i++) {
              inkCtx.lineTo(stroke.points[i].x * scale + offX, stroke.points[i].y * scale + offY);
            }
            inkCtx.stroke();
            inkCtx.restore();
          });
        }
      }
    }
  }, [strokes, scale, dragStrokeOffset, isDarkMode]);

  useEffect(() => {
    redrawStrokes();
  }, [redrawStrokes, pageWidth, pageHeight]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activeTool !== 'pen' && activeTool !== 'highlighter' && activeTool !== 'ruler') return;
    const canvas = drawCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;

    isDrawingRef.current = true;
    currentPointsRef.current = [{ x, y }];
    canvas.setPointerCapture(e.pointerId);

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.save();
      const isHighlighter = activeTool === 'highlighter';
      const isRuler = activeTool === 'ruler';
      const rawColor = isHighlighter ? highlighterColor : isRuler ? rulerColor : penColor;
      const effectiveColor = isHighlighter ? rawColor : getAdaptiveStrokeColor(rawColor, isDarkMode);

      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = isHighlighter ? (isDarkMode ? 0.60 : 0.52) : 1.0;
      ctx.strokeStyle = effectiveColor;
      ctx.lineWidth = (isHighlighter ? highlighterWidth : isRuler ? rulerWidth : penWidth) * scale;
      ctx.lineCap = isHighlighter ? 'square' : 'round';
      ctx.lineJoin = isHighlighter ? 'bevel' : 'round';
      ctx.beginPath();
      ctx.moveTo(x * scale, y * scale);
      ctx.lineTo(x * scale + 0.1, y * scale + 0.1);
      ctx.stroke();
      ctx.restore();
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    if (activeTool !== 'pen' && activeTool !== 'highlighter' && activeTool !== 'ruler') return;
    const canvas = drawCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    let x = (e.clientX - rect.left) / scale;
    let y = (e.clientY - rect.top) / scale;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (activeTool === 'ruler') {
      const startP = currentPointsRef.current[0];
      if (!startP) return;

      // Check 90 degree lock (horizontal or vertical perfectly straight line)
      if (rulerLock90) {
        const dx = Math.abs(x - startP.x);
        const dy = Math.abs(y - startP.y);
        if (dx >= dy) {
          // Snap horizontal
          y = startP.y;
        } else {
          // Snap vertical
          x = startP.x;
        }
      }

      currentPointsRef.current = [startP, { x, y }];

      // Clear live preview canvas and draw ruler line
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      ctx.globalAlpha = 1.0;
      ctx.strokeStyle = getAdaptiveStrokeColor(rulerColor, isDarkMode);
      ctx.lineWidth = rulerWidth * scale;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(startP.x * scale, startP.y * scale);
      ctx.lineTo(x * scale, y * scale);
      ctx.stroke();
      ctx.restore();
      return;
    }

    currentPointsRef.current.push({ x, y });

    if (activeTool === 'highlighter') {
      // Clear live canvas and redraw current stroke with proper opacity
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const pts = currentPointsRef.current;
      if (pts.length >= 2) {
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = isDarkMode ? 0.60 : 0.52;
        ctx.strokeStyle = highlighterColor;
        ctx.lineWidth = highlighterWidth * scale;
        ctx.lineCap = 'square';
        ctx.lineJoin = 'bevel';
        ctx.beginPath();
        ctx.moveTo(pts[0].x * scale, pts[0].y * scale);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i].x * scale, pts[i].y * scale);
        }
        ctx.stroke();
        ctx.restore();
      }
    } else {
      // Pen: draw segment directly onto live canvas
      const pts = currentPointsRef.current;
      const prev = pts[pts.length - 2];
      if (prev) {
        ctx.save();
        ctx.globalAlpha = 1.0;
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = getAdaptiveStrokeColor(penColor, isDarkMode);
        ctx.lineWidth = penWidth * scale;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(prev.x * scale, prev.y * scale);
        ctx.lineTo(x * scale, y * scale);
        ctx.stroke();
        ctx.restore();
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    const canvas = drawCanvasRef.current;
    if (canvas && canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }

    // Clear live canvas before committing stroke to persistent layer
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    if (currentPointsRef.current.length > 0 && onAddStroke) {
      let finalPoints = currentPointsRef.current;
      const isHighlighter = activeTool === 'highlighter';
      const isRuler = activeTool === 'ruler';

      if (isRuler) {
        if (finalPoints.length >= 2) {
          const p0 = finalPoints[0];
          let pEnd = finalPoints[finalPoints.length - 1];
          if (rulerLock90) {
            const dx = Math.abs(pEnd.x - p0.x);
            const dy = Math.abs(pEnd.y - p0.y);
            if (dx >= dy) {
              pEnd = { x: pEnd.x, y: p0.y };
            } else {
              pEnd = { x: p0.x, y: pEnd.y };
            }
          }
          finalPoints = [p0, pEnd];
          const newStroke: DrawingStroke = {
            id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            points: finalPoints,
            color: rulerColor,
            width: rulerWidth,
            tool: 'ruler',
            opacity: 1.0,
          };
          onAddStroke(pageNumber, newStroke);
        }
      } else {
        // Smart auto-straighten for highlighter if enabled
        if (isHighlighter && autoStraighten && finalPoints.length >= 2) {
          const p0 = finalPoints[0];
          const pLast = finalPoints[finalPoints.length - 1];
          if (Math.abs(pLast.y - p0.y) < 25) {
            const avgY = (p0.y + pLast.y) / 2;
            finalPoints = [{ x: p0.x, y: avgY }, { x: pLast.x, y: avgY }];
          } else {
            finalPoints = [p0, pLast];
          }
        }

        const newStroke: DrawingStroke = {
          id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          points: finalPoints,
          color: isHighlighter ? highlighterColor : penColor,
          width: isHighlighter ? highlighterWidth : penWidth,
          tool: isHighlighter ? 'highlighter' : 'pen',
          opacity: isHighlighter ? 0.52 : 1.0,
        };
        onAddStroke(pageNumber, newStroke);
      }
    }
    currentPointsRef.current = [];
    redrawStrokes();
  };

  const handlePageContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (activeTool === 'sticky-note' && onAddStickyNote) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - rect.left) / scale;
      const y = (e.clientY - rect.top) / scale;
      onAddStickyNote(pageNumber, x, y);
    }
  };

  // Select tool handlers for strokes and canvas
  const handleSelectPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeTool !== 'select') return;
    const overlay = e.currentTarget;
    const rect = overlay.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;

    // 1. If currently selected stroke bounding box was clicked, start dragging it immediately
    if (selectedStroke && strokeBBox) {
      const insideBox =
        x >= strokeBBox.minX &&
        x <= strokeBBox.maxX &&
        y >= strokeBBox.minY &&
        y <= strokeBBox.maxY;

      if (insideBox) {
        try {
          overlay.setPointerCapture(e.pointerId);
        } catch {}
        dragStrokeRef.current = {
          id: selectedStroke.id,
          startX: e.clientX,
          startY: e.clientY,
          originalPoints: selectedStroke.points.map((p) => ({ ...p })),
          hasMoved: false,
        };
        setIsDraggingStroke(true);
        setDragStrokeOffset({ id: selectedStroke.id, dx: 0, dy: 0 });
        return;
      }
    }

    // 2. Hit-test any stroke on this page (topmost stroke first)
    for (let i = strokes.length - 1; i >= 0; i--) {
      const st = strokes[i];
      if (hitTestStroke({ x, y }, st)) {
        onSelectItem?.({ type: 'stroke', id: st.id, pageNumber });
        try {
          overlay.setPointerCapture(e.pointerId);
        } catch {}
        dragStrokeRef.current = {
          id: st.id,
          startX: e.clientX,
          startY: e.clientY,
          originalPoints: st.points.map((p) => ({ ...p })),
          hasMoved: false,
        };
        setIsDraggingStroke(true);
        setDragStrokeOffset({ id: st.id, dx: 0, dy: 0 });
        return;
      }
    }

    // 3. Clicked empty page canvas -> deselect
    onSelectItem?.(null);
  };

  const handleSelectPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeTool !== 'select') return;

    if (dragStrokeRef.current) {
      const curId = dragStrokeRef.current.id;
      const dx = (e.clientX - dragStrokeRef.current.startX) / scale;
      const dy = (e.clientY - dragStrokeRef.current.startY) / scale;
      if (Math.hypot(dx, dy) > 2) {
        dragStrokeRef.current.hasMoved = true;
      }
      if (rafStrokeRef.current) cancelAnimationFrame(rafStrokeRef.current);
      rafStrokeRef.current = requestAnimationFrame(() => {
        setDragStrokeOffset({ id: curId, dx, dy });
      });
      return;
    }

    // Hover feedback when not dragging
    const overlay = e.currentTarget;
    const rect = overlay.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;

    if (selectedStroke && strokeBBox) {
      if (
        x >= strokeBBox.minX &&
        x <= strokeBBox.maxX &&
        y >= strokeBBox.minY &&
        y <= strokeBBox.maxY
      ) {
        setIsHoveringStroke(true);
        return;
      }
    }

    let hovering = false;
    for (let i = strokes.length - 1; i >= 0; i--) {
      if (hitTestStroke({ x, y }, strokes[i])) {
        hovering = true;
        break;
      }
    }
    setIsHoveringStroke(hovering);
  };

  const handleSelectPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStrokeRef.current) {
      if (rafStrokeRef.current) cancelAnimationFrame(rafStrokeRef.current);
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {}

      const curDrag = dragStrokeRef.current;
      if (curDrag && curDrag.hasMoved) {
        const finalDx = (e.clientX - curDrag.startX) / scale;
        const finalDy = (e.clientY - curDrag.startY) / scale;
        const curStroke = strokes.find((s) => s.id === curDrag.id);
        if (curStroke) {
          const newPoints = curDrag.originalPoints.map((p) => ({
            x: p.x + finalDx,
            y: p.y + finalDy,
          }));
          onUpdateStroke?.(pageNumber, curDrag.id, {
            ...curStroke,
            points: newPoints,
          });
        }
      }

      dragStrokeRef.current = null;
      setIsDraggingStroke(false);
      setDragStrokeOffset(null);
    }
  };

  const isEraserPointerDownRef = useRef<boolean>(false);
  const eraserCursorRef = useRef<HTMLDivElement>(null);
  const eraserOverlayRef = useRef<HTMLDivElement>(null);
  const overlayRectRef = useRef<DOMRect | null>(null);
  const hoveredEraserStrokeIdRef = useRef<string | null>(null);
  const hoveredEraserNoteIdRef = useRef<string | null>(null);
  const [hoveredEraserStrokeId, setHoveredEraserStrokeId] = useState<string | null>(null);
  const [hoveredEraserNoteId, setHoveredEraserNoteId] = useState<string | null>(null);

  // RAF throttles for smooth performance
  const eraseRafId = useRef<number | null>(null);
  const pendingEraseCoordsRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const hoverRafId = useRef<number | null>(null);
  const pendingHoverCoordsRef = useRef<{ clientX: number; clientY: number } | null>(null);

  const setHoveredStrokeIdSafe = useCallback((id: string | null) => {
    if (hoveredEraserStrokeIdRef.current !== id) {
      hoveredEraserStrokeIdRef.current = id;
      setHoveredEraserStrokeId(id);
    }
  }, []);

  const setHoveredNoteIdSafe = useCallback((id: string | null) => {
    if (hoveredEraserNoteIdRef.current !== id) {
      hoveredEraserNoteIdRef.current = id;
      setHoveredEraserNoteId(id);
    }
  }, []);

  // Check which specific stroke or sticky note is under the pointer for 'object' eraser mode
  const checkHoveredItem = useCallback((clientX: number, clientY: number) => {
    if (eraserMode !== 'object') {
      setHoveredStrokeIdSafe(null);
      setHoveredNoteIdSafe(null);
      return;
    }
    const overlayEl = eraserOverlayRef.current;
    if (!overlayEl) return;
    const rect = overlayRectRef.current || overlayEl.getBoundingClientRect();
    const x = (clientX - rect.left) / scale;
    const y = (clientY - rect.top) / scale;

    // Check sticky notes
    for (let i = stickyNotes.length - 1; i >= 0; i--) {
      const note = stickyNotes[i];
      if (Math.hypot(x - note.x, y - note.y) <= 24) {
        setHoveredNoteIdSafe(note.id);
        setHoveredStrokeIdSafe(null);
        return;
      }
    }

    // Check strokes with quick hit distance
    for (let i = strokes.length - 1; i >= 0; i--) {
      const st = strokes[i];
      if (hitTestStroke({ x, y }, st, 16)) {
        setHoveredStrokeIdSafe(st.id);
        setHoveredNoteIdSafe(null);
        return;
      }
    }

    setHoveredStrokeIdSafe(null);
    setHoveredNoteIdSafe(null);
  }, [eraserMode, strokes, stickyNotes, scale, setHoveredStrokeIdSafe, setHoveredNoteIdSafe]);

  // Eraser hit-detection for strokes and sticky notes (batch deletion)
  const eraseAtPosition = useCallback((clientX: number, clientY: number) => {
    const overlayEl = eraserOverlayRef.current;
    if (!overlayEl) return;
    const rect = overlayRectRef.current || overlayEl.getBoundingClientRect();
    const x = (clientX - rect.left) / scale;
    const y = (clientY - rect.top) / scale;
    const hitRadius = Math.max(8, (eraserSize / 2) / scale);

    // 1. Check sticky notes on this page
    for (let i = stickyNotes.length - 1; i >= 0; i--) {
      const note = stickyNotes[i];
      const dist = Math.hypot(x - note.x, y - note.y);
      if (dist <= hitRadius + 14) {
        onDeleteStickyNote?.(note.id);
        break;
      }
    }

    // 2. Check strokes on this page in batch
    const toDeleteIds: string[] = [];
    for (let i = strokes.length - 1; i >= 0; i--) {
      const st = strokes[i];
      if (hitTestStroke({ x, y }, st, hitRadius)) {
        toDeleteIds.push(st.id);
      }
    }
    if (toDeleteIds.length > 0) {
      if (onDeleteStrokes) {
        onDeleteStrokes(pageNumber, toDeleteIds);
      } else {
        toDeleteIds.forEach((id) => onDeleteStroke?.(pageNumber, id));
      }
    }
  }, [strokes, stickyNotes, scale, pageNumber, eraserSize, onDeleteStroke, onDeleteStrokes, onDeleteStickyNote]);

  const handleEraserPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeTool !== 'eraser') return;
    isEraserPointerDownRef.current = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    overlayRectRef.current = e.currentTarget.getBoundingClientRect();
    const rect = overlayRectRef.current;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (eraserCursorRef.current && eraserMode === 'area') {
      eraserCursorRef.current.style.display = 'block';
      eraserCursorRef.current.style.transform = `translate3d(${x - eraserSize / 2}px, ${y - eraserSize / 2}px, 0)`;
    }

    if (eraserMode === 'object') {
      const currentStrokeId = hoveredEraserStrokeIdRef.current;
      const currentNoteId = hoveredEraserNoteIdRef.current;
      if (currentStrokeId) {
        onDeleteStroke?.(pageNumber, currentStrokeId);
        setHoveredStrokeIdSafe(null);
      } else if (currentNoteId) {
        onDeleteStickyNote?.(currentNoteId);
        setHoveredNoteIdSafe(null);
      } else {
        // Direct tap or click on touchscreen
        const ptX = x / scale;
        const ptY = y / scale;
        let deleted = false;
        for (let i = stickyNotes.length - 1; i >= 0; i--) {
          const note = stickyNotes[i];
          if (Math.hypot(ptX - note.x, ptY - note.y) <= 24) {
            onDeleteStickyNote?.(note.id);
            deleted = true;
            break;
          }
        }
        if (!deleted) {
          for (let i = strokes.length - 1; i >= 0; i--) {
            const st = strokes[i];
            if (hitTestStroke({ x: ptX, y: ptY }, st, 16)) {
              onDeleteStroke?.(pageNumber, st.id);
              break;
            }
          }
        }
      }
    } else {
      eraseAtPosition(e.clientX, e.clientY);
      setHoveredStrokeIdSafe(null);
      setHoveredNoteIdSafe(null);
    }
  };

  const handleEraserPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeTool !== 'eraser') return;
    const rect = overlayRectRef.current || e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Instant circle position tracking in area mode
    if (eraserCursorRef.current && eraserMode === 'area') {
      eraserCursorRef.current.style.display = 'block';
      eraserCursorRef.current.style.transform = `translate3d(${x - eraserSize / 2}px, ${y - eraserSize / 2}px, 0)`;
    }

    if (isEraserPointerDownRef.current) {
      if (eraserMode === 'area') {
        pendingEraseCoordsRef.current = { clientX: e.clientX, clientY: e.clientY };
        if (!eraseRafId.current) {
          eraseRafId.current = requestAnimationFrame(() => {
            eraseRafId.current = null;
            if (pendingEraseCoordsRef.current && isEraserPointerDownRef.current) {
              eraseAtPosition(pendingEraseCoordsRef.current.clientX, pendingEraseCoordsRef.current.clientY);
            }
          });
        }
      }
    } else {
      if (eraserMode === 'object') {
        pendingHoverCoordsRef.current = { clientX: e.clientX, clientY: e.clientY };
        if (!hoverRafId.current) {
          hoverRafId.current = requestAnimationFrame(() => {
            hoverRafId.current = null;
            if (pendingHoverCoordsRef.current && !isEraserPointerDownRef.current) {
              checkHoveredItem(pendingHoverCoordsRef.current.clientX, pendingHoverCoordsRef.current.clientY);
            }
          });
        }
      }
    }
  };

  const handleEraserPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeTool !== 'eraser') return;
    isEraserPointerDownRef.current = false;
    if (eraseRafId.current) {
      cancelAnimationFrame(eraseRafId.current);
      eraseRafId.current = null;
    }
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {}
  };

  const handleEraserPointerLeave = () => {
    isEraserPointerDownRef.current = false;
    overlayRectRef.current = null;
    if (eraserCursorRef.current) {
      eraserCursorRef.current.style.display = 'none';
    }
    if (eraseRafId.current) {
      cancelAnimationFrame(eraseRafId.current);
      eraseRafId.current = null;
    }
    if (hoverRafId.current) {
      cancelAnimationFrame(hoverRafId.current);
      hoverRafId.current = null;
    }
    setHoveredStrokeIdSafe(null);
    setHoveredNoteIdSafe(null);
  };

  // Eye Comfort Theme & Brightness Calculation
  const brightness = eyeComfortSettings?.brightness ?? 100;
  const warmth = eyeComfortSettings?.warmth ?? 50;

  // Authentic warm book paper tone (کاغذ بالکی سوئدی / کرم گرم کتابخوان با کنتراست فوق‌العاده)
  const getWarmPaperColor = (w: number) => {
    const t = Math.max(0, Math.min(100, w)) / 100;
    // Interpolates from gentle soft cream to warm golden parchment
    const r = Math.round(254 - 6 * t);
    const g = Math.round(249 - 15 * t);
    const b = Math.round(238 - 38 * t);
    return `rgb(${r}, ${g}, ${b})`;
  };

  const warmPaperColor = getWarmPaperColor(warmth);

  let canvasFilter = 'none';
  let containerBg = 'bg-white';
  let containerBorder = 'border-neutral-300';
  let containerShadow = 'shadow-lg';

  if (colorMode === 'yellow') {
    canvasFilter = 'none'; // Zero sepia distortion! Colors remain 100% natural and text razor-sharp
    containerBg = 'bg-[#faf2df]';
    containerBorder = 'border-amber-200/80';
    containerShadow = 'shadow-lg shadow-amber-950/5';
  } else if (colorMode === 'dark-gray') {
    canvasFilter = 'invert(90%) hue-rotate(180deg) contrast(95%)';
    containerBg = 'bg-[#18181b]';
    containerBorder = 'border-neutral-800';
    containerShadow = 'shadow-xl shadow-black/80';
  } else if (colorMode === 'soft-gray') {
    canvasFilter = 'none';
    containerBg = 'bg-[#f0f0f4]';
    containerBorder = 'border-neutral-300';
    containerShadow = 'shadow-lg';
  }

  return (
    <div
      ref={containerRef}
      id={`pdf-page-${pageNumber}`}
      className="relative flex flex-col items-center my-3 sm:my-4 group transition-shadow shrink-0"
      style={{
        width: `${pageWidth}px`,
        minHeight: `${pageHeight}px`,
        maxWidth: isFitMode ? '100%' : undefined,
      }}
    >
      {/* Page Canvas Container with clean paper drop shadow and border */}
      <div
        onClick={handlePageContainerClick}
        className={`relative ${containerBg} ${containerShadow} rounded-sm overflow-hidden border ${containerBorder} ${
          activeTool === 'sticky-note' ? 'cursor-copy' : ''
        }`}
        style={{
          width: `${pageWidth}px`,
          height: `${pageHeight}px`,
          maxWidth: isFitMode ? '100%' : undefined,
          cursor: activeTool === 'sticky-note' ? 'copy' : 'inherit',
          touchAction: activeTool === 'hand' ? 'none' : 'auto',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          transition: 'background-color 0.25s ease, border-color 0.25s ease',
        }}
      >
        {/* PDF Content Canvas */}
        <canvas
          ref={canvasRef}
          className="block w-full h-full pointer-events-none"
          style={{
            cursor: 'inherit',
            filter: canvasFilter,
            transition: 'filter 0.25s ease',
          }}
        />

        {/* Eye Comfort Warm Book Paper Tint Layer (تلفیق نوری ضربی جهت ایجاد کاغذ کتاب گرم و آرام‌بخش بدون به هم ریختن رنگ‌ها) */}
        {colorMode === 'yellow' && (
          <div
            className="absolute inset-0 pointer-events-none z-10 transition-colors duration-200"
            style={{
              backgroundColor: warmPaperColor,
              mixBlendMode: 'multiply',
            }}
          />
        )}

        {/* Soft Gray Neutral Tint Layer */}
        {colorMode === 'soft-gray' && (
          <div
            className="absolute inset-0 pointer-events-none z-10 transition-colors duration-200"
            style={{
              backgroundColor: '#ededf2',
              mixBlendMode: 'multiply',
            }}
          />
        )}

        {/* 1. Dedicated Highlighter Layer (z-18): Fluorescent dyes that blend with text (screen in dark, multiply in light) */}
        <canvas
          ref={highlighterCanvasRef}
          width={pageWidth}
          height={pageHeight}
          style={{
            mixBlendMode: isDarkMode ? 'screen' : 'multiply',
          }}
          className="absolute inset-0 z-18 pointer-events-none"
        />

        {/* 2. Dedicated Ink Layer for Pen & Ruler (z-19): Solid ink with dark-mode contrast adaptation */}
        <canvas
          ref={inkCanvasRef}
          width={pageWidth}
          height={pageHeight}
          style={{
            mixBlendMode: 'normal',
          }}
          className="absolute inset-0 z-19 pointer-events-none"
        />

        {/* 3. Live Active Drawing Interaction Canvas (z-20) */}
        <canvas
          ref={drawCanvasRef}
          width={pageWidth}
          height={pageHeight}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={{
            mixBlendMode: activeTool === 'highlighter' ? (isDarkMode ? 'screen' : 'multiply') : 'normal',
          }}
          className={`absolute inset-0 z-20 ${
            activeTool === 'pen' || activeTool === 'highlighter' || activeTool === 'ruler'
              ? 'pointer-events-auto cursor-crosshair'
              : 'pointer-events-none'
          }`}
        />

        {/* Natural Ambient Hardware-Style Dimmer (کاهش یکدست نور با پاسخ فوری، روان و بدون تاخیر روی سیستم‌های اقتصادی) */}
        {brightness < 100 && (
          <div
            className="absolute inset-0 pointer-events-none z-30 transform-gpu"
            style={{
              backgroundColor: '#000000',
              opacity: Math.max(0, Math.min(0.72, ((100 - brightness) / 100) * 0.72)),
              willChange: 'opacity',
            }}
          />
        )}

        {/* Select Tool Interactive Overlay (z-25) */}
        {activeTool === 'select' && (
          <div
            onPointerDown={handleSelectPointerDown}
            onPointerMove={handleSelectPointerMove}
            onPointerUp={handleSelectPointerUp}
            style={{
              cursor: isDraggingStroke
                ? 'grabbing'
                : isHoveringStroke
                ? 'grab'
                : 'default',
            }}
            className="absolute inset-0 z-25 touch-none"
          />
        )}

        {/* Hover Highlight Preview for Object Eraser mode (Stroke) */}
        {activeTool === 'eraser' && eraserMode === 'object' && hoveredEraserStrokeId && (() => {
          const hoveredStroke = strokes.find((s) => s.id === hoveredEraserStrokeId);
          if (!hoveredStroke) return null;
          const bbox = getStrokeBBox(hoveredStroke);
          if (!bbox) return null;
          return (
            <div
              style={{
                left: `${bbox.minX * scale}px`,
                top: `${bbox.minY * scale}px`,
                width: `${bbox.width * scale}px`,
                height: `${bbox.height * scale}px`,
              }}
              className="absolute z-26 pointer-events-none border-2 border-rose-500 border-dashed rounded-lg bg-rose-500/15 animate-pulse shadow-sm"
            >
              <span className="absolute -top-6 right-0 bg-rose-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow whitespace-nowrap">
                حذف این ادیت (کلیک کنید)
              </span>
            </div>
          );
        })()}

        {/* Hover Highlight Preview for Object Eraser mode (Sticky Note) */}
        {activeTool === 'eraser' && eraserMode === 'object' && hoveredEraserNoteId && (() => {
          const hoveredNote = stickyNotes.find((n) => n.id === hoveredEraserNoteId);
          if (!hoveredNote) return null;
          return (
            <div
              style={{
                left: `${hoveredNote.x * scale - 18}px`,
                top: `${hoveredNote.y * scale - 18}px`,
                width: '36px',
                height: '36px',
              }}
              className="absolute z-26 pointer-events-none border-2 border-rose-600 border-dashed rounded-full bg-rose-500/25 animate-pulse shadow-lg ring-2 ring-rose-400"
            >
              <span className="absolute -top-6 right-1/2 translate-x-1/2 bg-rose-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow whitespace-nowrap">
                حذف یادداشت
              </span>
            </div>
          );
        })()}

        {/* Eraser Tool Interactive Overlay (z-25) */}
        {activeTool === 'eraser' && (
          <div
            ref={eraserOverlayRef}
            onPointerDown={handleEraserPointerDown}
            onPointerMove={handleEraserPointerMove}
            onPointerUp={handleEraserPointerUp}
            onPointerLeave={handleEraserPointerLeave}
            onPointerEnter={(e) => {
              overlayRectRef.current = e.currentTarget.getBoundingClientRect();
              if (eraserCursorRef.current && eraserMode === 'area') {
                eraserCursorRef.current.style.display = 'block';
              }
            }}
            style={{
              cursor: eraserMode === 'object'
                ? (hoveredEraserStrokeId || hoveredEraserNoteId ? 'pointer' : 'crosshair')
                : 'crosshair',
            }}
            className="absolute inset-0 z-25 touch-none"
          >
            {/* Visual circle indicator showing exact eraser area in area mode */}
            {eraserMode === 'area' && (
              <div
                ref={eraserCursorRef}
                style={{
                  display: 'none',
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: `${eraserSize}px`,
                  height: `${eraserSize}px`,
                  transform: 'translate3d(0, 0, 0)',
                  willChange: 'transform',
                  pointerEvents: 'none',
                }}
                className="rounded-full border-2 border-rose-500/80 bg-rose-500/15 shadow-sm transition-[width,height] duration-75"
              />
            )}
          </div>
        )}

        {/* Selected Stroke Bounding Box & Action Toolbar */}
        {activeTool === 'select' && isCurrentStrokeSelected && selectedStroke && strokeBBox && (() => {
          const boxDx = dragStrokeOffset && dragStrokeOffset.id === selectedStroke.id ? dragStrokeOffset.dx * scale : 0;
          const boxDy = dragStrokeOffset && dragStrokeOffset.id === selectedStroke.id ? dragStrokeOffset.dy * scale : 0;
          return (
            <div
              style={{
                left: `${strokeBBox.minX * scale + boxDx}px`,
                top: `${strokeBBox.minY * scale + boxDy}px`,
                width: `${strokeBBox.width * scale}px`,
                height: `${strokeBBox.height * scale}px`,
                willChange: isDraggingStroke ? 'left, top' : 'auto',
              }}
              className="absolute z-28 pointer-events-none border-2 border-dashed border-blue-500 rounded-xs bg-blue-500/5 select-none"
            >
              {/* 4 Corner handles */}
              <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-blue-600 rounded-[2px] shadow-xs" />
              <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-blue-600 rounded-[2px] shadow-xs" />
              <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-blue-600 rounded-[2px] shadow-xs" />
              <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-blue-600 rounded-[2px] shadow-xs" />

              {/* Floating Mini Action Toolbar */}
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 pointer-events-auto flex items-center gap-2 bg-neutral-900/95 backdrop-blur-xs text-white px-3 py-1.5 rounded-full shadow-xl text-xs font-medium z-40 select-none whitespace-nowrap">
                <span className="flex items-center gap-1.5 text-neutral-300">
                  <Move className="w-3.5 h-3.5 text-blue-400" />
                  <span>
                    {selectedStroke.tool === 'highlighter'
                      ? 'هایلایت'
                      : selectedStroke.tool === 'ruler'
                      ? 'خط‌کش (آندرلاین)'
                      : 'خط مداد'}
                  </span>
                </span>
                <span className="w-px h-3.5 bg-neutral-700" />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteStroke?.(pageNumber, selectedStroke.id);
                    onSelectItem?.(null);
                  }}
                  className="text-rose-400 hover:text-white hover:bg-rose-600 px-1.5 py-0.5 rounded-full transition-colors cursor-pointer flex items-center gap-1 text-[11px]"
                  title="حذف این خط (Delete)"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="text-[10px]">حذف</span>
                </button>
              </div>
            </div>
          );
        })()}

        {/* Sticky Notes on this page */}
        {stickyNotes.map((note) => {
          const isNoteSelected =
            selectedItem?.type === 'note' && selectedItem.id === note.id;
          const isNoteDragging = draggingNoteId === note.id;
          const noteDx = dragNoteOffset && dragNoteOffset.id === note.id ? dragNoteOffset.dx : 0;
          const noteDy = dragNoteOffset && dragNoteOffset.id === note.id ? dragNoteOffset.dy : 0;
          const renderX = (note.x + noteDx) * scale;
          const renderY = (note.y + noteDy) * scale;

          return (
            <div
              key={note.id}
              onPointerDown={(e) => {
                if (activeTool === 'select') {
                  e.stopPropagation();
                  onSelectItem?.({ type: 'note', id: note.id, pageNumber });
                  try {
                    e.currentTarget.setPointerCapture(e.pointerId);
                  } catch {}
                  dragNoteRef.current = {
                    id: note.id,
                    startX: e.clientX,
                    startY: e.clientY,
                    originX: note.x,
                    originY: note.y,
                    hasMoved: false,
                  };
                  setDraggingNoteId(note.id);
                  setDragNoteOffset({ id: note.id, dx: 0, dy: 0 });
                }
              }}
              onPointerMove={(e) => {
                if (
                  activeTool === 'select' &&
                  dragNoteRef.current &&
                  dragNoteRef.current.id === note.id
                ) {
                  const rawDx = (e.clientX - dragNoteRef.current.startX) / scale;
                  const rawDy = (e.clientY - dragNoteRef.current.startY) / scale;
                  if (Math.hypot(rawDx, rawDy) > 2) {
                    dragNoteRef.current.hasMoved = true;
                  }
                  const targetX = Math.max(15, Math.min(pageWidth / scale - 15, dragNoteRef.current.originX + rawDx));
                  const targetY = Math.max(15, Math.min(pageHeight / scale - 15, dragNoteRef.current.originY + rawDy));
                  const clampedDx = targetX - dragNoteRef.current.originX;
                  const clampedDy = targetY - dragNoteRef.current.originY;

                  if (rafNoteRef.current) cancelAnimationFrame(rafNoteRef.current);
                  rafNoteRef.current = requestAnimationFrame(() => {
                    setDragNoteOffset({ id: note.id, dx: clampedDx, dy: clampedDy });
                  });
                }
              }}
              onPointerUp={(e) => {
                if (activeTool === 'select' && dragNoteRef.current?.id === note.id) {
                  if (rafNoteRef.current) cancelAnimationFrame(rafNoteRef.current);
                  try {
                    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                      e.currentTarget.releasePointerCapture(e.pointerId);
                    }
                  } catch {}

                  const curDrag = dragNoteRef.current;
                  if (curDrag && curDrag.hasMoved) {
                    const rawDx = (e.clientX - curDrag.startX) / scale;
                    const rawDy = (e.clientY - curDrag.startY) / scale;
                    const finalX = Math.max(15, Math.min(pageWidth / scale - 15, curDrag.originX + rawDx));
                    const finalY = Math.max(15, Math.min(pageHeight / scale - 15, curDrag.originY + rawDy));
                    onMoveStickyNote?.(note.id, pageNumber, finalX, finalY);
                  }

                  dragNoteRef.current = null;
                  setDraggingNoteId(null);
                  setDragNoteOffset(null);
                }
              }}
              onClick={(e) => {
                e.stopPropagation();
                // Single-click always opens the sticky note in the side drawer to read and edit!
                onOpenStickyNote?.(note);
                if (activeTool === 'select') {
                  onSelectItem?.({ type: 'note', id: note.id, pageNumber });
                }
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onOpenStickyNote?.(note);
              }}
              style={{
                left: `${renderX}px`,
                top: `${renderY}px`,
                transform: 'translate(-50%, -50%)',
                backgroundColor: note.color || '#fef08a',
                cursor:
                  activeTool === 'select'
                    ? isNoteDragging
                      ? 'grabbing'
                      : 'grab'
                    : 'pointer',
                touchAction: 'none',
                willChange: isNoteDragging ? 'left, top' : 'auto',
              }}
              className={`absolute z-30 w-8 h-8 rounded-xl shadow-md border flex items-center justify-center select-none ${
                isDarkMode ? 'border-neutral-500/50 shadow-lg shadow-black/60 ring-1 ring-white/10' : 'border-neutral-800/15'
              } ${
                isNoteDragging
                  ? 'ring-2 ring-blue-500 shadow-xl opacity-90 scale-110'
                  : isNoteSelected
                  ? `ring-2 ring-blue-500 ring-offset-2 ${isDarkMode ? 'ring-offset-neutral-900' : 'ring-offset-white'} scale-110 shadow-lg`
                  : 'hover:scale-110 transition-transform'
              }`}
              title={
                note.title
                  ? `${note.title} (کلیک برای باز کردن در پنل کناری)`
                  : 'استیکی نوت (کلیک برای باز کردن در پنل کناری)'
              }
            >
              {(note.images && note.images.length > 0) || note.imageUrl ? (
                <div className="w-full h-full rounded-xl overflow-hidden relative flex items-center justify-center">
                  <img
                    src={note.images?.[0] || note.imageUrl}
                    alt=""
                    className="w-full h-full object-cover rounded-xl"
                  />
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                    <StickyNote className="w-3.5 h-3.5 text-white drop-shadow-xs" />
                  </div>
                </div>
              ) : (
                <StickyNote className="w-4 h-4 text-neutral-800" />
              )}
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-rose-500 border border-white" />
              {((note.images && note.images.length > 0) || note.imageUrl) && (
                <span className="absolute -bottom-1 -left-1 min-w-[14px] h-3.5 px-0.5 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-xs border border-white text-[9px] font-mono font-bold leading-none">
                  {note.images && note.images.length > 1 ? (
                    note.images.length
                  ) : (
                    <ImageIcon className="w-2 h-2" />
                  )}
                </span>
              )}

              {/* Floating Action Badge for Selected Sticky Note */}
              {activeTool === 'select' && isNoteSelected && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="absolute -top-10 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-neutral-900/95 backdrop-blur-xs text-white px-2.5 py-1 rounded-full shadow-xl text-xs font-medium z-40 select-none whitespace-nowrap"
                >
                  <span className="flex items-center gap-1 text-neutral-300 text-[11px]">
                    <Move className="w-3 h-3 text-blue-400" />
                    <span>جابه‌جایی</span>
                  </span>
                  <span className="w-px h-3 bg-neutral-700" />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenStickyNote?.(note);
                    }}
                    className="text-neutral-300 hover:text-white p-0.5 rounded-full hover:bg-white/10 cursor-pointer"
                    title="ویرایش متن استیکی نوت"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteStickyNote?.(note.id);
                      onSelectItem?.(null);
                    }}
                    className="text-rose-400 hover:text-white hover:bg-rose-600 p-0.5 rounded-full transition-colors cursor-pointer"
                    title="حذف استیکی نوت"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {/* Loading state placeholder */}
        {!isRendered && (
          <div className="absolute inset-0 bg-neutral-50 flex flex-col items-center justify-center text-neutral-400 gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-neutral-500" />
            <span className="text-xs font-mono tabular-nums">در حال بارگذاری صفحه {pageNumber}...</span>
          </div>
        )}
      </div>

      {/* Page number footer */}
      <div className="mt-2 text-[11px] text-neutral-500 font-mono tabular-nums select-none">
        صفحه {pageNumber}
      </div>
    </div>
  );
};

export const PdfPage = React.memo(PdfPageComponent);
