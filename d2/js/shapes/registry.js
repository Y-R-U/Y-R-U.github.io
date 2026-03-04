// shapes/registry.js - Maps shape type to renderer
import { ShapeType } from '../state.js';
import { RectShape } from './rect.js';
import { EllipseShape } from './ellipse.js';
import { LineShape } from './line.js';
import { ArrowShape } from './arrow.js';
import { PathShape } from './path.js';
import { ImageShape } from './image.js';

const registry = {
  [ShapeType.RECT]: RectShape,
  [ShapeType.ELLIPSE]: EllipseShape,
  [ShapeType.LINE]: LineShape,
  [ShapeType.ARROW]: ArrowShape,
  [ShapeType.PATH]: PathShape,
  [ShapeType.IMAGE]: ImageShape,
};

export function getShapeRenderer(type) {
  return registry[type] || null;
}

export function isLineType(type) {
  return type === ShapeType.LINE || type === ShapeType.ARROW;
}
