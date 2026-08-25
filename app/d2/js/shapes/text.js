// shapes/text.js - Text renderer with word-wrapping and font scaling on resize
import { transformBounds } from './utils.js';

const PADDING = 6;

export const TextShape = {
  draw(ctx, shape) {
    const { x, y, width, height, text, fillColor, strokeColor } = shape;
    const fontSize = shape.fontSize || 16;

    // Background fill
    if (fillColor) {
      ctx.fillStyle = fillColor;
      ctx.fillRect(x, y, width, height);
    }

    // Draw text
    if (text) {
      ctx.save();
      // Clip to box
      ctx.beginPath();
      ctx.rect(x, y, width, height);
      ctx.clip();

      ctx.fillStyle = strokeColor || '#000000';
      ctx.font = `${fontSize}px sans-serif`;
      ctx.textBaseline = 'top';

      const lines = this._wrapText(ctx, text, width - PADDING * 2);
      const lineHeight = fontSize * 1.3;

      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], x + PADDING, y + PADDING + i * lineHeight);
      }
      ctx.restore();
    }
  },

  _wrapText(ctx, text, maxWidth) {
    if (!text || maxWidth <= 0) return [];
    const paragraphs = text.split('\n');
    const allLines = [];

    for (const para of paragraphs) {
      if (para === '') {
        allLines.push('');
        continue;
      }
      const words = para.split(' ');
      let currentLine = '';

      for (const word of words) {
        const testLine = currentLine ? currentLine + ' ' + word : word;
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && currentLine) {
          allLines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) allLines.push(currentLine);
    }

    return allLines;
  },

  hitTest(shape, px, py) {
    return px >= shape.x && px <= shape.x + shape.width &&
           py >= shape.y && py <= shape.y + shape.height;
  },

  getBounds(shape) {
    return { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
  },

  transformByHandle(shape, handleId, dx, dy) {
    const oldHeight = shape.height;
    const result = transformBounds(shape, handleId, dx, dy);
    // Scale font size proportionally with height change
    if (oldHeight > 0) {
      const scale = result.height / oldHeight;
      result.fontSize = Math.max(8, Math.round((shape.fontSize || 16) * scale));
    }
    return result;
  },
};
