import { useRef, useState, useEffect } from "react";

function DrawingCanvas({ color, lineWidth }) {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState([]);
  const [history, setHistory] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  const historyRef = useRef([]);
  const redoRef = useRef([]);

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

  const redraw = () => {
    const ctx = ctxRef.current;
    if (!ctx) return;

    clearCanvasInternal();

    historyRef.current.forEach((stroke) => {
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.lineWidth;
      ctx.beginPath();
      stroke.points.forEach((p, i) => {
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
    ctxRef.current = ctx;

    redraw();
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

  const getMousePos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const startDrawing = (e) => {
    const pos = getMousePos(e);
    const ctx = ctxRef.current;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setCurrentStroke([pos]);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const pos = getMousePos(e);
    const ctx = ctxRef.current;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setCurrentStroke((p) => [...p, pos]);
  };

  const endDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    ctxRef.current.closePath();

    const stroke = { color, lineWidth, points: currentStroke };

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

  return (
    <div id="drawingCanvas">
      <button onClick={undo}>
        {" "}
        <i className="fas fa-rotate-left"></i>
      </button>
      <button onClick={redo}>
        {" "}
        <i className="fas fa-rotate-right"></i>
      </button>
      <button onClick={clearCanvas}>
        {" "}
        <i className="fa-regular fa-trash-can"></i>
      </button>
      <canvas
        ref={canvasRef}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={endDrawing}
        onMouseLeave={endDrawing}
      />
    </div>
  );
}

export default DrawingCanvas;
