
import { Level } from './types';

export const GRID_SIZE = 8; // Max grid size for orthographic views
export const VIEWPORT_SIZE = 300; // Universal size for the main drawing/rendering area (e.g., 300px x 300px)
export const AXIS_LABEL_PADDING = 40; // Padding around orthographic grids for axes and labels

export const CELL_SIZE = VIEWPORT_SIZE / GRID_SIZE; // Calculated dynamically for orthographic grids

export const CELL_FILL_COLOR = '#3b82f6'; // Blue-500
export const CELL_STROKE_COLOR = '#60a5fa'; // Blue-400

// Isometric Constants
export const ISOMETRIC_BLOCK_SIZE = CELL_SIZE; // Base isometric block size, matching scaled cell size
export const ISOMETRIC_CANVAS_SIZE = VIEWPORT_SIZE;
export const PROJ_ANGLE = Math.PI / 6; // 30 degrees for isometric projection
export const ISOMETRIC_X_COEFF = Math.cos(PROJ_ANGLE);
export const ISOMETRIC_Y_COEFF = Math.sin(PROJ_ANGLE);
export const ROTATION_SENSITIVITY = 0.01; // How much rotation per pixel of drag. Adjust to tune feel.

// View direction for camera-facing check (approximate for isometric projection)
export const VIEW_DIRECTION_VECTOR = { x: 0.5, y: 0.5, z: 0.5 }; // Roughly looking towards positive X, Y, Z

// Shading factors for faces
export const SHADE_FACTOR_FRONT = 0.9; // Slightly darker than top
export const SHADE_FACTOR_SIDE = 0.8;  // Darker than front
export const SHADE_FACTOR_BACK = 0.7;  // Even darker for faces pointing away (e.g., bottom face)
export const GREY_BACK_LEFT_FACE_COLOR = '#A6A6A6'; // 35% grey tone for visible back/left faces

export const ISO_COLORS = {
  top: '#fde047', // Yellow-300
  front: '#ef4444', // Red-500
  side: '#3b82f6', // Blue-500
  stroke: '#1f2937', // Gray-800
};

export const HIGHLIGHT_COLOR = '#84cc16'; // Lime-500 for highlighting blocks

// Shape Generation Constants
export const BLOCK_COUNTS_BY_LEVEL = {
  [Level.LEVEL_1]: { min: 4, max: 7 },
  [Level.LEVEL_2]: { min: 7, max: 10 },
  [Level.LEVEL_3]: { min: 10, max: 15 },
};

export const MAX_REGEN_ATTEMPTS = 50; // Max attempts to generate a valid shape for a level
