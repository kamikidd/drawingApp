import "./App.css";
import { useState, useRef } from "react";
import DrawingCanvas from "./DrawingCanvas";
function App() {
  const [fullscreen, setFullscreen] = useState(false);
  const [darkmode, setDarkmode] = useState(false);
  const [color, setColor] = useState("#000000");
  const [lineWidth, setLineWidth] = useState(7);
  const [tool, setTool] = useState("brush");

  const canvasRef = useRef();

  return (
    <div
      className={`app-container ${fullscreen ? "fullscreen" : ""} ${
        darkmode ? "dark-mode" : ""
      }`}
    >
      <div className="top-bar">
        <h1> Drawing App Pro</h1>
        <div className="toolbar">
          <div className="tool-group">
            <div className="tool">
              <label htmlFor="colorPicker">Color</label>
              <input
                type="color"
                id="colorPicker"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
            </div>
            <div className="tool">
              <label htmlFor="brushSize">Brush Size</label>

              <div className="brush-slider">
                <input
                  type="range"
                  id="brushSize"
                  min="1"
                  max="40"
                  defaultValue="7"
                  onChange={(e) => setLineWidth(Number(e.target.value))}
                />
                <span id="brushSizeValue">{lineWidth}</span>
              </div>
            </div>
          </div>
          <div className="tool-group">
            <button
              className={` ${tool === "brush" ? "btn-active" : "btn btn-icon"}`}
              title="Brush"
              onClick={() => {
                setTool("brush");
              }}
            >
              <i className="fas fa-paint-brush"></i>
            </button>
            <button
              className={` ${
                tool === "eraser" ? "btn-active" : "btn btn-icon"
              }`}
              title="Eraser"
              onClick={() => {
                setTool("eraser");
              }}
            >
              <i className="fas fa-eraser"></i>
            </button>
            <button
              className="btn btn-icon "
              id="fullScreenBtn"
              title="Toggle Full Screen"
              onClick={() => setFullscreen(!fullscreen)}
            >
              <i className="fas fa-expand"></i>
            </button>

            <button
              className="btn btn-icon"
              id="themeToggle"
              title="Toggle Theme"
              onClick={() => setDarkmode(!darkmode)}
            >
              <i className="fas fa-moon"></i>
            </button>
          </div>
        </div>
      </div>
      <DrawingCanvas
        ref={canvasRef}
        color={color}
        lineWidth={lineWidth}
        tool={tool}
      />
    </div>
  );
}

export default App;
