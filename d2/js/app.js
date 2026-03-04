// app.js - Bootstrap: wire state, renderer, tools, UI, events
import { createState } from './state.js';
import { createHistory } from './history.js';
import { createRenderer } from './renderer.js';
import { setupEventHandler } from './event-handler.js';
import { createSelectTool } from './tools/select-tool.js';
import { createDrawTool } from './tools/draw-tool.js';
import { createRectTool } from './tools/rect-tool.js';
import { createEllipseTool } from './tools/ellipse-tool.js';
import { createLineTool } from './tools/line-tool.js';
import { createTextTool } from './tools/text-tool.js';
import { ShapeType } from './state.js';
import { setupToolbar } from './ui/toolbar.js';
import { setupLayerPanel } from './ui/layer-panel.js';

// Create state
const state = createState();
const history = createHistory(state);

// Create renderer
const mainCanvas = document.getElementById('canvas-main');
const overlayCanvas = document.getElementById('canvas-overlay');
const renderer = createRenderer(mainCanvas, overlayCanvas);

// Size canvases to fill container
const container = document.getElementById('canvas-container');
function resizeCanvases() {
  const rect = container.getBoundingClientRect();
  renderer.resize(rect.width, rect.height);
  renderer.renderMain(state);
  renderer.renderOverlay(state, null);
}
const resizeObserver = new ResizeObserver(resizeCanvases);
resizeObserver.observe(container);
resizeCanvases();

// Create tools
const tools = {
  select: createSelectTool(),
  draw: createDrawTool(),
  rect: createRectTool(),
  ellipse: createEllipseTool(),
  line: createLineTool(ShapeType.LINE),
  arrow: createLineTool(ShapeType.ARROW),
  text: createTextTool(),
};

// Setup event handling
setupEventHandler(state, history, renderer, tools);

// Setup UI
setupToolbar(state, history, renderer);
setupLayerPanel(state, history);

// Create initial layer
state.addLayer('Layer 1');

// Initial render
renderer.renderMain(state);
renderer.renderOverlay(state, null);
