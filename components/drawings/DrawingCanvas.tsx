"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { triggerBackup } from "@/lib/backup/trigger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Undo2, ZoomIn, ZoomOut, RotateCcw, Trash2, Save, Hand, Pencil as PencilIcon } from "lucide-react";
import type { DrawingStroke, JobDrawing } from "@/lib/types/database";

const MIN_SCALE = 0.25;
const MAX_SCALE = 6;

function pointFromEvent(canvas: HTMLCanvasElement, scale: number, offset: { x: number; y: number }, clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left - offset.x) / scale,
    y: (clientY - rect.top - offset.y) / scale,
  };
}

export function DrawingCanvas({ jobId, drawing }: { jobId: string; drawing: JobDrawing }) {
  const router = useRouter();
  const supabase = createClient();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const strokesRef = useRef<DrawingStroke[]>(drawing.strokes ?? []);
  const drawingRef = useRef(false);
  const panningRef = useRef<{ x: number; y: number } | null>(null);
  const lastPinchRef = useRef<number | null>(null);

  const [label, setLabel] = useState(drawing.label);
  const [mode, setMode] = useState<"draw" | "pan">("draw");
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(scale, scale);
    for (const stroke of strokesRef.current) {
      if (stroke.points.length < 2) continue;
      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (const p of stroke.points.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
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
      canvas.width = wrap.clientWidth;
      canvas.height = wrap.clientHeight;
      redraw();
    }
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [redraw]);

  function zoom(factor: number, center?: { x: number; y: number }) {
    setScale((prevScale) => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prevScale * factor));
      const canvas = canvasRef.current;
      const anchor = center ?? (canvas ? { x: canvas.width / 2, y: canvas.height / 2 } : { x: 0, y: 0 });
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

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    if (mode === "pan") {
      panningRef.current = { x: e.clientX, y: e.clientY };
      return;
    }
    drawingRef.current = true;
    const pt = pointFromEvent(canvas, scale, offset, e.clientX, e.clientY);
    strokesRef.current = [...strokesRef.current, { color: "#0f172a", width: 3, points: [pt] }];
    setDirty(true);
    redraw();
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (mode === "pan" && panningRef.current) {
      const dx = e.clientX - panningRef.current.x;
      const dy = e.clientY - panningRef.current.y;
      panningRef.current = { x: e.clientX, y: e.clientY };
      setOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      return;
    }
    if (!drawingRef.current) return;
    const pt = pointFromEvent(canvas, scale, offset, e.clientX, e.clientY);
    const current = strokesRef.current[strokesRef.current.length - 1];
    current.points.push(pt);
    redraw();
  }

  function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    drawingRef.current = false;
    panningRef.current = null;
    canvasRef.current?.releasePointerCapture(e.pointerId);
  }

  function handleWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const center = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    zoom(e.deltaY < 0 ? 1.1 : 0.9, center);
  }

  // Two-finger pinch-to-zoom for tablets.
  function touchDistance(touches: React.TouchList) {
    const [a, b] = [touches[0], touches[1]];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  function handleTouchStart(e: React.TouchEvent<HTMLCanvasElement>) {
    if (e.touches.length === 2) {
      lastPinchRef.current = touchDistance(e.touches);
    }
  }

  function handleTouchMove(e: React.TouchEvent<HTMLCanvasElement>) {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dist = touchDistance(e.touches);
      if (lastPinchRef.current) {
        const factor = dist / lastPinchRef.current;
        const canvas = canvasRef.current;
        const rect = canvas?.getBoundingClientRect();
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - (rect?.left ?? 0);
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - (rect?.top ?? 0);
        zoom(factor, { x: midX, y: midY });
      }
      lastPinchRef.current = dist;
    }
  }

  function handleTouchEnd() {
    lastPinchRef.current = null;
  }

  function undo() {
    strokesRef.current = strokesRef.current.slice(0, -1);
    setDirty(true);
    redraw();
  }

  function clearAll() {
    if (!confirm("Clear this entire page? This cannot be undone.")) return;
    strokesRef.current = [];
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
        <div className="flex items-center gap-1 ml-auto">
          <Button type="button" variant={mode === "draw" ? "default" : "outline"} size="sm" onClick={() => setMode("draw")}>
            <PencilIcon className="h-4 w-4" />
          </Button>
          <Button type="button" variant={mode === "pan" ? "default" : "outline"} size="sm" onClick={() => setMode("pan")}>
            <Hand className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => zoom(0.8)}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => zoom(1.25)}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={resetView}>
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={undo}>
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={clearAll}>
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button type="button" size="sm" onClick={save} disabled={saving || !dirty}>
            <Save className="h-4 w-4" /> {saving ? "Saving..." : "Save"}
          </Button>
        </div>
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
          onPointerLeave={handlePointerUp}
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="w-full h-full"
          style={{ cursor: mode === "pan" ? "grab" : "crosshair" }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Scroll/pinch to zoom, switch to the hand tool to pan. Remember to tap Save when you&apos;re done.
      </p>
    </div>
  );
}
