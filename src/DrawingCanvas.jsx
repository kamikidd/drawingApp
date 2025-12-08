import { useRef, useState, useEffect } from "react";

function DrawingCanvas({ color, lineWidth, tool }) {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState([]);
  const [history, setHistory] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  const historyRef = useRef([]);
  const redoRef = useRef([]);

  // ✅ Camera (zoom + pan)
  const scaleRef = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });

  const pinchStartDist = useRef(null);
  const pinchStartScale = useRef(1);
  const pinchStartCenter = useRef(null);

  const redraw = () => {
    const ctx = ctxRef.current;
    if (!ctx) return;

    clearCanvasInternal();

    historyRef.current.forEach((stroke) => {
      ctx.globalCompositeOperation =
        stroke.tool === "eraser" ? "destination-out" : "source-over";

      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.lineWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      stroke.points.forEach((p, i) => {
        ctx.lineWidth = stroke.lineWidth * (p.pressure || 1);

        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
      ctx.closePath();
    });
  };

  const resizeCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const parent = canvas.parentElement;
    const rect = parent.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);

    canvas.style.width = rect.width + "px";
    canvas.style.height = rect.height + "px";

    const ctx = canvas.getContext("2d");
    ctx.resetTransform();
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctxRef.current = ctx;

    redraw();
  };

  // ---------- Coordinate conversion ----------
  const screenToCanvas = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - offsetRef.current.x) / scaleRef.current;
    const y = (e.clientY - rect.top - offsetRef.current.y) / scaleRef.current;
    return { x, y };
  };

  const touchToCanvas = (t) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (t.clientX - rect.left - offsetRef.current.x) / scaleRef.current;
    const y = (t.clientY - rect.top - offsetRef.current.y) / scaleRef.current;
    return { x, y };
  };
  // ---------- Pinch Zoom ----------
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
      const [a, b] = e.touches;
      pinchStartDist.current = getDist(a, b);
      pinchStartScale.current = scaleRef.current;
      pinchStartCenter.current = getCenter(a, b);
    }
  };

  const handleTouchMove = (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();

      const [a, b] = e.touches;
      const newDist = getDist(a, b);
      const newCenter = getCenter(a, b);

      const scale =
        pinchStartScale.current * (newDist / pinchStartDist.current);

      scaleRef.current = Math.min(Math.max(scale, 0.5), 4);

      // pan with fingers
      offsetRef.current.x += newCenter.x - pinchStartCenter.current.x;
      offsetRef.current.y += newCenter.y - pinchStartCenter.current.y;

      pinchStartCenter.current = newCenter;
      redraw();
    }
  };

  const handleTouchEnd = () => {
    pinchStartDist.current = null;
  };

  const getPointerPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const startDrawing = (e) => {
    if (e.pointerType === "touch" && e.isPrimary === false) return;

    const pos = screenToCanvas(e);
    const ctx = ctxRef.current;
    const pressure = e.pressure && e.pressure !== 0 ? e.pressure : 1;

    if (tool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = color;
    }

    ctx.lineWidth = lineWidth * pressure;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    //draw point
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();

    setCurrentStroke([{ ...pos, pressure }]);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const pos = screenToCanvas(e);
    const ctx = ctxRef.current;
    const pressure = e.pressure && e.pressure !== 0 ? e.pressure : 1;

    if (tool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = color;
    }

    ctx.lineWidth = lineWidth * pressure;
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setCurrentStroke((p) => [...p, { ...pos, pressure }]);
  };

  const endDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    ctxRef.current.closePath();

    const stroke = {
      tool,
      color,
      lineWidth,
      points: currentStroke,
    };

    const nextHistory = [...historyRef.current, stroke];
    historyRef.current = nextHistory;
    redoRef.current = [];

    setHistory(nextHistory);
    setRedoStack([]);

    setCurrentStroke([]);
  };

  const undo = () => {
    if (historyRef.current.length === 0) return;

    const prev = [...historyRef.current];
    const last = prev.pop();

    historyRef.current = prev;
    redoRef.current = [...redoRef.current, last];

    setHistory(prev);
    setRedoStack(redoRef.current);

    redraw();
  };

  const redo = () => {
    if (redoRef.current.length === 0) return;

    const stack = [...redoRef.current];
    const stroke = stack.pop();

    const nextHistory = [...historyRef.current, stroke];

    redoRef.current = stack;
    historyRef.current = nextHistory;

    setRedoStack(stack);
    setHistory(nextHistory);

    redraw();
  };

  const clearCanvas = () => {
    historyRef.current = [];
    redoRef.current = [];
    setHistory([]);
    setRedoStack([]);
    clearCanvasInternal();
  };

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    redoRef.current = redoStack;
  }, [redoStack]);

  const clearCanvasInternal = () => {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
  };
  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, []);

  useEffect(() => {
    if (!ctxRef.current) return;
    ctxRef.current.strokeStyle = color;
    ctxRef.current.lineWidth = lineWidth;
  }, [color, lineWidth]);

  return (
    <div id="drawingCanvas">
      <button className="button" onClick={undo}>
        {" "}
        <i className="fas fa-rotate-left"></i>
      </button>
      <button className="button" onClick={redo}>
        {" "}
        <i className="fas fa-rotate-right"></i>
      </button>
      <button className="button" onClick={clearCanvas}>
        {" "}
        <i className="fa-regular fa-trash-can"></i>
      </button>
      <canvas
        ref={canvasRef}
        onPointerDown={startDrawing}
        onPointerMove={draw}
        onPointerUp={endDrawing}
        onPointerLeave={endDrawing}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ touchAction: "none" }}
      />
    </div>
  );
}

export default DrawingCanvas;
