"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { triggerBackup } from "@/lib/backup/trigger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Undo2, ZoomIn, ZoomOut, RotateCcw, Trash2, Save, Hand, Pencil as PencilIcon, Eraser } from "lucide-react";
import type { DrawingStroke, JobDrawing } from "@/lib/types/database";

const MIN_SCALE = 0.25;
const MAX_SCALE = 6;

const COLORS = ["#0f172a", "#dc2626", "#2563eb", "#16a34a"];
const PEN_SIZES = [2, 4, 8];
const ERASER_SIZE = 24;

type Tool = "draw" | "erase" | "pan";

function toCanvasPoint(canvas: HTMLCanvasElement, scale: number, offset: { x: number; y: number }, clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left - offset.x) / scale,
    y: (clientY - rect.top - offset.y) / scale,
  };
}

function midpoint(a: { x: number; y: number }, b: { x: number; y: number }) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function DrawingCanvas({ jobId, drawing }: { jobId: string; drawing: JobDrawing }) {
  const router = useRouter();
  const supabase = createClient();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const strokesRef = useRef<DrawingStroke[]>(drawing.strokes ?? []);
  const activeStrokeRef = useRef<DrawingStroke | null>(null);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ distance: number; mid: { x: number; y: number } } | null>(null);
  const panRef = useRef<{ x: number; y: number } | null>(null);
  const ratioRef = useRef(1);

  const [label, setLabel] = useState(drawing.label);
  const [tool, setTool] = useState<Tool>("draw");
  const [color, setColor] = useState(COLORS[0]);
  const [penSize, setPenSize] = useState(PEN_SIZES[1]);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [canUndo, setCanUndo] = useState(strokesRef.current.length > 0);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(ratioRef.current, ratioRef.current);
    ctx.translate(offset.x, offset.y);
    ctx.scale(scale, scale);

    const allStrokes = activeStrokeRef.current ? [...strokesRef.current, activeStrokeRef.current] : strokesRef.current;
    for (const stroke of allStrokes) {
      if (stroke.points.length < 2) continue;
      ctx.globalCompositeOperation = stroke.erase ? "destination-out" : "source-over";
      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length - 1; i++) {
        const m = midpoint(stroke.points[i], stroke.points[i + 1]);
        ctx.quadraticCurveTo(stroke.points[i].x, stroke.points[i].y, m.x, m.y);
      }
      const last = stroke.points[stroke.points.length - 1];
      ctx.lineTo(last.x, last.y);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.restore();
  }, [offset, scale]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  useEffect(() => {
    function resize() {
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      if (!canvas || !wrap) return;
      const ratio = window.devicePixelRatio || 1;
      ratioRef.current = ratio;
      canvas.width = wrap.clientWidth * ratio;
      canvas.height = wrap.clientHeight * ratio;
      canvas.style.width = `${wrap.clientWidth}px`;
      canvas.style.height = `${wrap.clientHeight}px`;
      redraw();
    }
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function zoom(factor: number, center?: { x: number; y: number }) {
    setScale((prevScale) => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prevScale * factor));
      const canvas = canvasRef.current;
      const rect = canvas?.getBoundingClientRect();
      const anchor = center ?? (rect ? { x: rect.width / 2, y: rect.height / 2 } : { x: 0, y: 0 });
      setOffset((prevOffset) => ({
        x: anchor.x - ((anchor.x - prevOffset.x) / prevScale) * next,
        y: anchor.y - ((anchor.y - prevOffset.y) / prevScale) * next,
      }));
      return next;
    });
  }

  function resetView() {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }

  function startStroke(pt: { x: number; y: number }) {
    activeStrokeRef.current =
      tool === "erase"
        ? { color: "#000000", width: ERASER_SIZE, points: [pt], erase: true }
        : { color, width: penSize, points: [pt] };
  }

  function commitStroke() {
    if (activeStrokeRef.current && activeStrokeRef.current.points.length > 1) {
      strokesRef.current = [...strokesRef.current, activeStrokeRef.current];
      setDirty(true);
      setCanUndo(true);
    }
    activeStrokeRef.current = null;
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size >= 2) {
      // A second finger landed — abandon any in-progress stroke and switch to pinch/pan.
      activeStrokeRef.current = null;
      redraw();
      const pts = Array.from(pointersRef.current.values());
      pinchRef.current = { distance: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), mid: midpoint(pts[0], pts[1]) };
      panRef.current = null;
      return;
    }

    if (tool === "pan") {
      panRef.current = { x: e.clientX, y: e.clientY };
      return;
    }
    const pt = toCanvasPoint(canvas, scale, offset, e.clientX, e.clientY);
    startStroke(pt);
    redraw();
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size >= 2) {
      const pts = Array.from(pointersRef.current.values());
      const rect = canvas.getBoundingClientRect();
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const mid = midpoint(pts[0], pts[1]);
      const localMid = { x: mid.x - rect.left, y: mid.y - rect.top };
      if (pinchRef.current) {
        const factor = dist / pinchRef.current.distance;
        zoom(factor, localMid);
        const dx = mid.x - pinchRef.current.mid.x;
        const dy = mid.y - pinchRef.current.mid.y;
        if (dx || dy) setOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      }
      pinchRef.current = { distance: dist, mid };
      return;
    }

    if (tool === "pan" && panRef.current) {
      const dx = e.clientX - panRef.current.x;
      const dy = e.clientY - panRef.current.y;
      panRef.current = { x: e.clientX, y: e.clientY };
      setOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      return;
    }

    if (!activeStrokeRef.current) return;
    const pt = toCanvasPoint(canvas, scale, offset, e.clientX, e.clientY);
    activeStrokeRef.current.points.push(pt);
    redraw();
  }

  function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    pointersRef.current.delete(e.pointerId);
    canvasRef.current?.releasePointerCapture(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size === 0) {
      panRef.current = null;
      commitStroke();
      redraw();
    }
  }

  function handleWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const center = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    zoom(e.deltaY < 0 ? 1.1 : 0.9, center);
  }

  function undo() {
    strokesRef.current = strokesRef.current.slice(0, -1);
    setCanUndo(strokesRef.current.length > 0);
    setDirty(true);
    redraw();
  }

  function clearAll() {
    if (!confirm("Clear this entire page? This cannot be undone.")) return;
    strokesRef.current = [];
    setCanUndo(false);
    setDirty(true);
    redraw();
  }

  async function save() {
    setSaving(true);
    const canvas = canvasRef.current;
    const thumbCanvas = document.createElement("canvas");
    thumbCanvas.width = 320;
    thumbCanvas.height = 240;
    const tctx = thumbCanvas.getContext("2d");
    if (tctx && canvas) {
      tctx.fillStyle = "#ffffff";
      tctx.fillRect(0, 0, thumbCanvas.width, thumbCanvas.height);
      tctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, thumbCanvas.width, thumbCanvas.height);
    }
    const thumbnail = thumbCanvas.toDataURL("image/png");

    await supabase
      .from("job_drawings")
      .update({ label, strokes: strokesRef.current, thumbnail })
      .eq("id", drawing.id);

    triggerBackup({ jobId });
    setDirty(false);
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          value={label}
          onChange={(e) => {
            setLabel(e.target.value);
            setDirty(true);
          }}
          className="max-w-xs"
          placeholder="Page label"
        />
        <Button type="button" size="sm" className="ml-auto" onClick={save} disabled={saving || !dirty}>
          <Save className="h-4 w-4" /> {saving ? "Saving..." : "Save"}
        </Button>
      </div>

      <div className="flex items-center gap-1 flex-wrap rounded-lg border bg-slate-50 p-1.5">
        <Button type="button" variant={tool === "draw" ? "default" : "outline"} size="sm" onClick={() => setTool("draw")} title="Pen">
          <PencilIcon className="h-4 w-4" />
        </Button>
        <Button type="button" variant={tool === "erase" ? "default" : "outline"} size="sm" onClick={() => setTool("erase")} title="Eraser">
          <Eraser className="h-4 w-4" />
        </Button>
        <Button type="button" variant={tool === "pan" ? "default" : "outline"} size="sm" onClick={() => setTool("pan")} title="Pan">
          <Hand className="h-4 w-4" />
        </Button>

        <div className="w-px h-6 bg-slate-300 mx-1" />

        {tool === "draw" && (
          <>
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                title={c}
                className={`h-7 w-7 rounded-full border-2 ${color === c ? "border-slate-900" : "border-transparent"}`}
                style={{ backgroundColor: c }}
              />
            ))}
            <div className="w-px h-6 bg-slate-300 mx-1" />
            {PEN_SIZES.map((s) => (
              <button
                key={s}
                onClick={() => setPenSize(s)}
                title={`${s}px`}
                className={`h-7 w-7 rounded-full flex items-center justify-center border ${penSize === s ? "border-slate-900 bg-white" : "border-slate-200"}`}
              >
                <span className="rounded-full bg-slate-900" style={{ width: s + 2, height: s + 2 }} />
              </button>
            ))}
          </>
        )}

        <div className="w-px h-6 bg-slate-300 mx-1" />

        <Button type="button" variant="outline" size="sm" onClick={() => zoom(0.8)} title="Zoom out">
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => zoom(1.25)} title="Zoom in">
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={resetView} title="Reset view">
          <RotateCcw className="h-4 w-4" />
        </Button>

        <div className="w-px h-6 bg-slate-300 mx-1" />

        <Button type="button" variant="outline" size="sm" onClick={undo} disabled={!canUndo} title="Undo">
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={clearAll} title="Clear page">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div
        ref={wrapRef}
        className="border rounded-lg overflow-hidden bg-white"
        style={{ height: "70vh", touchAction: "none" }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onWheel={handleWheel}
          className="w-full h-full block"
          style={{ cursor: tool === "pan" ? "grab" : tool === "erase" ? "cell" : "crosshair" }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        One finger draws or erases, two fingers pinch-zoom and pan. Remember to tap Save when you&apos;re done.
      </p>
    </div>
  );
}
