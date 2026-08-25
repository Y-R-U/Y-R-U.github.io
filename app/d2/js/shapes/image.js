// shapes/image.js - Pasted image renderer
import { transformBounds } from './utils.js';

export const ImageShape = {
  draw(ctx, shape) {
    const img = this._getImage(shape);
    if (!img || !img.complete) return;
    ctx.drawImage(img, shape.x, shape.y, shape.width, shape.height);
  },

  hitTest(shape, px, py) {
    return px >= shape.x && px <= shape.x + shape.width &&
           py >= shape.y && py <= shape.y + shape.height;
  },

  getBounds(shape) {
    return { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
  },

  transformByHandle(shape, handleId, dx, dy) {
    return transformBounds(shape, handleId, dx, dy);
  },

  _getImage(shape) {
    if (shape._imageElement) return shape._imageElement;
    if (!shape.dataUrl) return null;
    const img = new Image();
    img.src = shape.dataUrl;
    shape._imageElement = img;
    return img;
  },
};
