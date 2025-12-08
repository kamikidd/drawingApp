import { useRef, useState, useEffect } from "react";

/**
 * DrawingCanvas with:
 * - DPR-correct rendering
 * - camera (pan + pinch-zoom)
 * - pinch detection (no accidental drawing)
 * - strokes replayed (undo/redo)
 * - eraser support via stroke.tool === 'eraser'
 * - pressure support
 */
function DrawingCanvas({ color, lineWidth, tool = "brush" }) {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);

  // stroke state
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState([]);

  // history (state + refs for avoiding stale closures)
  const [history, setHistory] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const historyRef = useRef([]);
  const redoRef = useRef([]);

  // camera & DPR
  const scaleRef = useRef(1); // zoom factor (CSS px)
  const offsetRef = useRef({ x: 0, y: 0 }); // pan (CSS px)
  const dprRef = useRef(window.devicePixelRatio || 1);

  // pinch helpers
  const isPinchingRef = useRef(false);
  const pinchStartDist = useRef(0);
  const pinchStartScale = useRef(1);
  const pinchStartCenter = useRef({ x: 0, y: 0 });

  // keep refs in sync with state
  useEffect(() => {
    historyRef.current = history;
  }, [history]);
  useEffect(() => {
    redoRef.current = redoStack;
  }, [redoStack]);

  // ---------- Resize & init ----------
  const resizeCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement || canvas;
    const rect = parent.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    dprRef.current = dpr;

    // backing store (device pixels)
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);

    // visible size (CSS pixels)
    canvas.style.width = rect.width + "px";
    canvas.style.height = rect.height + "px";

    // context
    const ctx = canvas.getContext("2d");
    ctxRef.current = ctx;

    // redraw using setTransform (we handle dpr + camera inside redraw)
    redraw();
  };

  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    // also handle DPR change (zoom in browser may change devicePixelRatio)
    const mq = window.matchMedia(
      `(resolution: ${window.devicePixelRatio}dppx)`
    );
    const handleDprChange = () => resizeCanvas();
    try {
      mq.addEventListener("change", handleDprChange);
    } catch {
      // fallback for older browsers
      if (mq.addListener) mq.addListener(handleDprChange);
    }
    return () => {
      window.removeEventListener("resize", resizeCanvas);
      try {
        mq.removeEventListener("change", handleDprChange);
      } catch {
        if (mq.removeListener) mq.removeListener(handleDprChange);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Clear the full backing bitmap ----------
  const clearBacking = (ctx) => {
    // clear entire device-pixel backing store to avoid artifacts
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); // reset transform to device px space
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  };

  // ---------- Redraw (uses setTransform to avoid accumulation) ----------
  const redraw = () => {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;

    // clear full backing
    clearBacking(ctx);

    // compute transform: map CSS coords -> device pixels
    const dpr = dprRef.current;
    const cameraScale = scaleRef.current;
    const a = dpr * cameraScale; // x scale
    const d = dpr * cameraScale; // y scale
    const e = Math.round(offsetRef.current.x * dpr); // translate x in device px
    const f = Math.round(offsetRef.current.y * dpr); // translate y in device px

    // set full transform (a,b,c,d,e,f)
    ctx.setTransform(a, 0, 0, d, e, f);

    // now draw strokes (strokes stored in CSS px coords)
    for (const stroke of historyRef.current) {
      // compositing for eraser
      ctx.globalCompositeOperation =
        stroke.tool === "eraser" ? "destination-out" : "source-over";

      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      // draw points (support pressure)
      if (!stroke.points || stroke.points.length === 0) continue;
      ctx.beginPath();
      for (let i = 0; i < stroke.points.length; i++) {
        const p = stroke.points[i];
        const pressure = p.pressure || 1;
        ctx.lineWidth = (stroke.lineWidth || 1) * pressure;
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      // stroke with strokeStyle (for eraser globalCompositeOperation makes it erase)
      ctx.strokeStyle = stroke.color || "#000";
      ctx.stroke();
      ctx.closePath();
    }

    // reset composite to default
    ctx.globalCompositeOperation = "source-over";
  };

  // ---------- Coordinate conversion (screen -> canvas CSS px coords) ----------
  const screenToCanvasCSS = (clientX, clientY) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    // subtract camera offset (offsetRef in CSS px) then divide by scale
    const x = (clientX - rect.left - offsetRef.current.x) / scaleRef.current;
    const y = (clientY - rect.top - offsetRef.current.y) / scaleRef.current;
    return { x, y };
  };

  // ---------- Pinch handlers (touch only) ----------
  const getDist = (t1, t2) => {
    const dx = t2.clientX - t1.clientX;
    const dy = t2.clientY - t1.clientY;
    return Math.hypot(dx, dy);
  };
  const getCenter = (t1, t2) => ({
    x: (t1.clientX + t2.clientX) / 2,
    y: (t1.clientY + t2.clientY) / 2,
  });

  const handleTouchStart = (e) => {
    if (e.touches.length === 2) {
      isPinchingRef.current = true;
      const [a, b] = e.touches;
      pinchStartDist.current = getDist(a, b);
      pinchStartScale.current = scaleRef.current;
      pinchStartCenter.current = getCenter(a, b);
    }
  };

  const handleTouchMove = (e) => {
    if (e.touches.length === 2 && isPinchingRef.current) {
      e.preventDefault(); // prevent page zoom/scroll

      const [a, b] = e.touches;
      const newDist = getDist(a, b);
      const newCenter = getCenter(a, b);

      const scaleCandidate =
        pinchStartScale.current * (newDist / pinchStartDist.current);
      // clamp scale
      const nextScale = Math.min(Math.max(scaleCandidate, 0.3), 6);

      // compute center delta and convert to CSS px delta
      const dx = newCenter.x - pinchStartCenter.current.x;
      const dy = newCenter.y - pinchStartCenter.current.y;

      // update camera: adjust offset so zoom center stays under the fingers
      // we want the canvas point under the pinch center to remain stable:
      // formula: offset' = offset + centerDelta + center*(1 - scale'/scale)
      const prevScale = scaleRef.current;
      const centerClient = newCenter; // in client px

      // translate client center to canvas CSS coords before scale change
      const canvasCenterBefore = {
        x:
          (centerClient.x -
            (canvasRef.current.getBoundingClientRect().left +
              offsetRef.current.x)) /
          prevScale,
        y:
          (centerClient.y -
            (canvasRef.current.getBoundingClientRect().top +
              offsetRef.current.y)) /
          prevScale,
      };

      // update scale
      scaleRef.current = nextScale;

      // compute new offset so that the canvas point under centerClient remains at same screen position
      offsetRef.current.x =
        centerClient.x -
        canvasRef.current.getBoundingClientRect().left -
        canvasCenterBefore.x * scaleRef.current;
      offsetRef.current.y =
        centerClient.y -
        canvasRef.current.getBoundingClientRect().top -
        canvasCenterBefore.y * scaleRef.current;

      // also add panning due to fingers moving
      offsetRef.current.x += dx;
      offsetRef.current.y += dy;

      // update pinch start center for next delta
      pinchStartCenter.current = newCenter;
      pinchStartDist.current = newDist;
      pinchStartScale.current = scaleRef.current;

      // redraw
      redraw();
    }
  };

  const handleTouchEnd = (e) => {
    if (e.touches && e.touches.length < 2) {
      isPinchingRef.current = false;
      pinchStartDist.current = null;
    }
  };

  // ---------- Pointer drawing (ignore pointer while pinching) ----------
  const onPointerDown = (e) => {
    // ignore non-primary pointers (e.g., when multitouch)
    if (isPinchingRef.current) return;
    if (e.pointerType === "touch" && e.isPrimary === false) return;

    const pos = screenToCanvasCSS(e.clientX, e.clientY);
    const ctx = ctxRef.current;
    if (!ctx) return;

    // set drawing mode
    if (tool === "eraser") ctx.globalCompositeOperation = "destination-out";
    else ctx.globalCompositeOperation = "source-over";

    const pressure = e.pressure && e.pressure !== 0 ? e.pressure : 1;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth * pressure;

    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    // draw a dot for taps
    ctx.lineTo(pos.x + 0.01, pos.y + 0.01);
    ctx.stroke();

    setCurrentStroke([{ ...pos, pressure }]);
    setIsDrawing(true);

    // capture pointer to continue receiving events even if pointer leaves
    try {
      e.target.setPointerCapture(e.pointerId);
    } catch {}
  };

  const onPointerMove = (e) => {
    if (!isDrawing || isPinchingRef.current) return;
    const pos = screenToCanvasCSS(e.clientX, e.clientY);
    const ctx = ctxRef.current;
    if (!ctx) return;

    const pressure = e.pressure && e.pressure !== 0 ? e.pressure : 1;
    if (tool === "eraser") ctx.globalCompositeOperation = "destination-out";
    else ctx.globalCompositeOperation = "source-over";

    ctx.lineWidth = lineWidth * pressure;
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();

    setCurrentStroke((s) => [...s, { ...pos, pressure }]);
  };

  const onPointerUp = (e) => {
    if (!isDrawing) return;
    const ctx = ctxRef.current;
    if (!ctx) return;
    ctx.closePath();

    // push stroke
    const stroke = {
      tool,
      color,
      lineWidth,
      points: currentStroke.slice(),
    };
    historyRef.current = [...historyRef.current, stroke];
    redoRef.current = [];
    setHistory(historyRef.current);
    setRedoStack([]);

    setCurrentStroke([]);
    setIsDrawing(false);

    try {
      e.target.releasePointerCapture(e.pointerId);
    } catch {}
  };

  // ---------- Undo/Redo/Clear ----------
  const undo = () => {
    if (historyRef.current.length === 0) return;
    const prev = historyRef.current.slice(0, -1);
    const popped = historyRef.current[historyRef.current.length - 1];
    historyRef.current = prev;
    redoRef.current = [...redoRef.current, popped];
    setHistory(prev);
    setRedoStack(redoRef.current);
    redraw();
  };
  const redo = () => {
    if (redoRef.current.length === 0) return;
    const restored = redoRef.current[redoRef.current.length - 1];
    redoRef.current = redoRef.current.slice(0, -1);
    historyRef.current = [...historyRef.current, restored];
    setRedoStack(redoRef.current);
    setHistory(historyRef.current);
    redraw();
  };
  const clearCanvas = () => {
    historyRef.current = [];
    redoRef.current = [];
    setHistory([]);
    setRedoStack([]);
    const ctx = ctxRef.current;
    clearBacking(ctx);
  };

  // sync context default style
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
  }, [color, lineWidth]);

  // ---------- JSX ----------
  return (
    <div
      id="drawingCanvas"
      style={{ width: "100%", height: "100%", position: "relative" }}
    >
      <div style={{ position: "absolute", zIndex: 3, left: 8, top: 8 }}>
        <button onClick={undo}>Undo</button>
        <button onClick={redo}>Redo</button>
        <button onClick={clearCanvas}>Clear</button>
      </div>

      <canvas
        ref={canvasRef}
        style={{
          touchAction: "none",
          display: "block",
          width: "100%",
          height: "100%",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />
    </div>
  );
}

export default DrawingCanvas;
