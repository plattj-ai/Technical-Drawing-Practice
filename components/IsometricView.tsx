
import React from 'react';
import { PolyCube, BlockCoordinates } from '../types';
import {
  ISOMETRIC_CANVAS_SIZE, ISOMETRIC_BLOCK_SIZE, ISO_COLORS, GRID_SIZE, ROTATION_SENSITIVITY,
  ISOMETRIC_X_COEFF, ISOMETRIC_Y_COEFF, VIEW_DIRECTION_VECTOR,
  SHADE_FACTOR_FRONT, SHADE_FACTOR_SIDE, SHADE_FACTOR_BACK, VIEWPORT_SIZE, GREY_BACK_LEFT_FACE_COLOR
} from '../constants';
import { calculateDimensions } from '../services/projectionCalculator';

interface IsometricViewProps {
  polyCube: PolyCube | null;
  // Removed highlightedBlocks: BlockCoordinates[]; // New prop for highlighted blocks
}

interface IsometricPoint {
  x: number;
  y: number;
}

interface Rotated3DPoint {
  x: number;
  y: number;
  // FIX: Add 'z' property as it's used in rotations and dot products
  z: number;
}

/**
 * Represents an individual block in the polyCube, with its original and rotated coordinates.
 */
interface DrawableBlock {
  originalX: number;
  originalY: number;
  originalZ: number;
  rotatedX: number;
  rotatedY: number;
  rotatedZ: number;
  // A simple depth key for sorting (e.g., sum of rotated coords)
  depth: number;
}

/**
 * Defines a face of a unit cube with its corner indices and normal vector.
 * The normal vector is in the block's local coordinate system.
 */
interface FaceDefinition {
  corners: number[]; // Indices into UNIT_CUBE_CORNERS
  normal: Rotated3DPoint; // Unit normal vector in local 3D space (e.g., {0,1,0} for top)
}

// Define the 8 corners of a unit cube (0,0,0) to (1,1,1)
const UNIT_CUBE_CORNERS = [
  { x: 0, y: 0, z: 0 }, // 0: (0,0,0)
  { x: 1, y: 0, z: 0 }, // 1: (1,0,0)
  { x: 0, y: 1, z: 0 }, // 2: (0,1,0)
  { x: 0, y: 0, z: 1 }, // 3: (0,0,1)
  { x: 1, y: 1, z: 0 }, // 4: (1,1,0)
  { x: 1, y: 0, z: 1 }, // 5: (1,0,1)
  { x: 0, y: 1, z: 1 }, // 6: (0,1,1)
  { x: 1, y: 1, z: 1 }, // 7: (1,1,1)
];

// Define the 6 faces of a unit cube with their corner indices (clockwise for front-facing)
// and their normal vectors. These normals are in the block's local space.
const UNIT_CUBE_FACES: FaceDefinition[] = [
  // Top face (y=1 plane, normal up)
  { corners: [2, 4, 7, 6], normal: { x: 0, y: 1, z: 0 } },
  // Bottom face (y=0 plane, normal down)
  { corners: [0, 3, 5, 1], normal: { x: 0, y: -1, z: 0 } },
  // Front face (z=1 plane, normal forward)
  { corners: [3, 6, 7, 5], normal: { x: 0, y: 0, z: 1 } },
  // Back face (z=0 plane, normal backward)
  { corners: [0, 1, 4, 2], normal: { x: 0, y: 0, z: -1 } },
  // Right face (x=1 plane, normal right)
  { corners: [1, 5, 7, 4], normal: { x: 1, y: 0, z: 0 } },
  // Left face (x=0 plane, normal left)
  { corners: [0, 2, 6, 3], normal: { x: -1, y: 0, z: 0 } },
];

/**
 * Applies 3D rotations around the X and Y axes to a given 3D point.
 * @param x Original 3D X coordinate.
 * @param y Original 3D Y coordinate.
 * @param z Original 3D Z coordinate.
 * @param rotationX Angle of rotation around the X-axis (pitch).
 * @param rotationY Angle of rotation around the Y-axis (yaw).
 * @returns The new 3D point after rotations.
 */
function applyRotation(x: number, y: number, z: number, rotationX: number, rotationY: number): Rotated3DPoint {
  // Rotate around Y-axis (yaw)
  const cosY = Math.cos(rotationY);
  const sinY = Math.sin(rotationY);
  let _x = x * cosY + z * sinY;
  let _z = -x * sinY + z * cosY;
  let _y = y;

  // Rotate around X-axis (pitch)
  const cosX = Math.cos(rotationX);
  const sinX = Math.sin(rotationX);
  let finalY = _y * cosX - _z * sinX;
  let finalZ = _y * sinX + _z * cosX;
  let finalX = _x;

  return { x: finalX, y: finalY, z: finalZ };
}

/**
 * Applies 3D rotations around the X and Y axes to a given 3D vector.
 * (Same as applyRotation for points, but semantically for vectors)
 * @param vx Original vector X component.
 * @param vy Original vector Y component.
 * @param vz Original vector Z component.
 * @param rotationX Angle of rotation around the X-axis (pitch).
 * @param rotationY Angle of rotation around the Y-axis (yaw).
 * @returns The new 3D vector after rotations.
 */
function rotateVector(vx: number, vy: number, vz: number, rotationX: number, rotationY: number): Rotated3DPoint {
  return applyRotation(vx, vy, vz, rotationX, rotationY);
}

/**
 * Converts 3D block coordinates (x, y, z) to raw 2D isometric screen coordinates (x', y').
 * Assumes Y is the vertical (height) axis, where 0 is the bottom of the 3D space.
 *
 * @param x 3D X coordinate.
 * @param y 3D Y coordinate (height, 0 is bottom).
 * @param z 3D Z coordinate.
 * @param blockSize The size of one unit block in pixels.
 * @returns Raw IsometricPoint (x, y) without any canvas offsets.
 */
function map3DToRawIsometric(x: number, y: number, z: number, blockSize: number): IsometricPoint {
  // Classic isometric projection formulas with Y-axis going straight up:
  // X-axis going down-right, Z-axis going down-left.
  // The `- y * blockSize` term ensures that higher 3D `y` values result in more negative `rawIsoY`,
  // which will then be mapped to a smaller canvas Y (higher on screen) when translated.
  const rawIsoX = (x - z) * blockSize * ISOMETRIC_X_COEFF;
  const rawIsoY = (x + z) * blockSize * ISOMETRIC_Y_COEFF - y * blockSize;
  return { x: rawIsoX, y: rawIsoY };
}

/**
 * Helper to draw a single quadrilateral face.
 */
function drawIsometricFace(ctx: CanvasRenderingContext2D, points: IsometricPoint[], color: string, strokeColor: string) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  ctx.lineTo(points[1].x, points[1].y);
  ctx.lineTo(points[2].x, points[2].y);
  ctx.lineTo(points[3].x, points[3].y);
  ctx.closePath();

  ctx.fillStyle = color;
  ctx.fill();

  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 1;
  ctx.stroke();
}

/**
 * Draws the 3D coordinate axes (X, Y, Z) rotating with the object.
 */
function drawAxes(
  ctx: CanvasRenderingContext2D,
  blockSize: number,
  translateX: number,
  translateY: number,
  rotationX: number,
  rotationY: number
) {
  const axisLength = blockSize * 2; // Make axes visible
  const origin3D = { x: 0, y: 0, z: 0 };

  const axes = [
    { target: { x: axisLength, y: 0, z: 0 }, color: '#ef4444', label: 'X' }, // Red
    { target: { x: 0, y: axisLength, z: 0 }, color: '#22c55e', label: 'Y' }, // Green
    { target: { x: 0, y: 0, z: axisLength }, color: '#3b82f6', label: 'Z' }, // Blue
  ];

  const rotatedOrigin = applyRotation(origin3D.x, origin3D.y, origin3D.z, rotationX, rotationY);
  const projectedOrigin = map3DToRawIsometric(rotatedOrigin.x, rotatedOrigin.y, rotatedOrigin.z, blockSize);
  const translatedOrigin = { x: projectedOrigin.x + translateX, y: projectedOrigin.y + translateY };

  ctx.lineWidth = 2;
  ctx.font = '12px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  axes.forEach(axis => {
    const rotatedTarget = applyRotation(axis.target.x, axis.target.y, axis.target.z, rotationX, rotationY);
    const projectedTarget = map3DToRawIsometric(rotatedTarget.x, rotatedTarget.y, rotatedTarget.z, blockSize);
    const translatedTarget = { x: projectedTarget.x + translateX, y: projectedTarget.y + translateY };

    ctx.strokeStyle = axis.color;
    ctx.beginPath();
    ctx.moveTo(translatedOrigin.x, translatedOrigin.y);
    ctx.lineTo(translatedTarget.x, translatedTarget.y);
    ctx.stroke();

    ctx.fillStyle = axis.color;
    ctx.fillText(axis.label, translatedTarget.x, translatedTarget.y);
  });
}


/**
 * Draws only the visible faces of a single unit block.
 * Applies a global translation (translateX, translateY) to position the block on the canvas.
 * Takes the block's original 3D coordinates and global rotation angles for projection.
 */
function drawIsometricBlockFaces(
  ctx: CanvasRenderingContext2D,
  polyCube: PolyCube, // Needed to check for adjacent blocks
  originalBlockX: number, // Original X (0-indexed in GRID_SIZE)
  originalBlockY: number, // Original Y (0-indexed in GRID_SIZE)
  originalBlockZ: number, // Original Z (0-indexed in GRID_SIZE)
  colors: typeof ISO_COLORS,
  blockSize: number,
  translateX: number,
  translateY: number,
  rotationX: number, // Global rotation X-angle
  rotationY: number  // Global rotation Y-angle
  // Removed isHighlighted: boolean // New parameter for highlighting
) {
  // For each corner, first get its world 3D coordinate, then apply global rotation, then project to 2D isometric.
  const rotatedProjectedCorners = UNIT_CUBE_CORNERS.map(uc => {
    // 1. Get world 3D coordinate of the corner (relative to block's original position)
    const worldX = originalBlockX + uc.x;
    const worldY = originalBlockY + uc.y;
    const worldZ = originalBlockZ + uc.z;
    // 2. Apply global rotation to this world 3D coordinate
    const rotated = applyRotation(worldX, worldY, worldZ, rotationX, rotationY);
    // 3. Project the rotated 3D coordinate to raw 2D isometric
    return map3DToRawIsometric(rotated.x, rotated.y, rotated.z, blockSize);
  });

  // Apply global translation to each raw isometric point
  const translatedPoints = rotatedProjectedCorners.map(pt => ({ x: pt.x + translateX, y: pt.y + translateY }));

  for (const face of UNIT_CUBE_FACES) {
    // 1. Check if the face is naturally exposed in the unrotated polyCube (no adjacent block in that direction)
    const neighborX = originalBlockX + face.normal.x;
    const neighborY = originalBlockY + face.normal.y;
    const neighborZ = originalBlockZ + face.normal.z;

    const isNaturallyExposed =
      neighborX < 0 || neighborX >= GRID_SIZE ||
      neighborY < 0 || neighborY >= GRID_SIZE ||
      neighborZ < 0 || neighborZ >= GRID_SIZE ||
      polyCube[neighborX]?.[neighborY]?.[neighborZ] !== 1; // Check if neighbor block exists

    if (!isNaturallyExposed) {
      continue; // Skip drawing this face if it's covered by another block
    }

    // 2. Check if the face is facing the camera after rotation
    const rotatedNormal = rotateVector(face.normal.x, face.normal.y, face.normal.z, rotationX, rotationY);
    // Dot product with a view direction vector. If positive, it faces the viewer.
    // Normalized dot product is not strictly necessary for just the sign.
    const dotProduct =
      rotatedNormal.x * VIEW_DIRECTION_VECTOR.x +
      rotatedNormal.y * VIEW_DIRECTION_VECTOR.y +
      rotatedNormal.z * VIEW_DIRECTION_VECTOR.z;

    const isFacingCamera = dotProduct > 0;

    if (isFacingCamera) {
      ctx.save(); // Save context before applying dashed lines

      let currentStrokeColor = colors.stroke;
      let applyDash = false;
      let shadedColor = '';

      // Removed if (!isHighlighted) { // Only apply dash and special shading if not highlighted
        // Check for 'back' face (normal.z < 0) or 'left' face (normal.x < 0) in original object space
        if (face.normal.z < 0 || face.normal.x < 0) {
          applyDash = true;
          shadedColor = GREY_BACK_LEFT_FACE_COLOR; // Apply fixed grey color
        }
      // Removed }

      if (applyDash) {
        ctx.setLineDash([4, 2]); // Apply dashed pattern: 4px line, 2px gap
      }

      // If shadedColor hasn't been set by the special back/left logic, calculate it based on original orientation
      if (!shadedColor) {
        let baseColor = '';
        let shadeFactor = 1;

        // Assign base color based on the face's normal in the unrotated object space
        if (face.normal.y > 0) { // Original Top face
          baseColor = colors.top;
          shadeFactor = 1; // Brightest
        } else if (face.normal.z > 0) { // Original Front face
          baseColor = colors.front;
          shadeFactor = SHADE_FACTOR_FRONT;
        } else if (face.normal.x > 0) { // Original Right Side face
          baseColor = colors.side;
          shadeFactor = SHADE_FACTOR_SIDE;
        } else if (face.normal.y < 0) { // Original Bottom face
          baseColor = colors.top; // Base color from top, but darkest shade
          shadeFactor = SHADE_FACTOR_BACK;
        } else {
          // Fallback, though all main normals should be covered
          baseColor = colors.stroke; // Use stroke color as a neutral fallback
          shadeFactor = SHADE_FACTOR_BACK;
        }

        // Simple shading: convert hex to RGB, apply factor, convert back to hex
        const hexToRgb = (hex: string) =>
          hex.replace(/^#?([a-f\d])([a-f\d])([a-f\d])$/i, (m, r, g, b) => '#' + r + r + g + g + b + b)
             .substring(1).match(/.{2}/g)!.map(x => parseInt(x, 16));
        const rgbToHex = (r: number, g: number, b: number) =>
          '#' + [r, g, b].map(x => Math.round(x).toString(16).padStart(2, '0')).join('');

        const [r, g, b] = hexToRgb(baseColor).map(c => c * shadeFactor);
        shadedColor = rgbToHex(r, g, b);
      }

      const facePoints = face.corners.map(idx => translatedPoints[idx]);
      drawIsometricFace(ctx, facePoints, shadedColor, currentStrokeColor);

      if (applyDash) {
        ctx.setLineDash([]); // Reset dashed pattern after drawing this face
      }
      
      // Removed if (isHighlighted) {
      //   // Draw an additional, thicker highlight stroke regardless of dashed pattern
      //   ctx.strokeStyle = HIGHLIGHT_COLOR;
      //   ctx.lineWidth = 3; // Thicker line for highlight
      //   ctx.stroke();
      // }

      ctx.restore(); // Restore context
    }
  }
}

const IsometricView: React.FC<IsometricViewProps> = ({ polyCube }) => { // Removed highlightedBlocks
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [rotateXAngle, setRotateXAngle] = React.useState(0);
  const [rotateYAngle, setRotateYAngle] = React.useState(0);
  const [isDragging, setIsDragging] = React.useState(false);
  // Using a ref to store drag start state to avoid stale closures in event handlers
  const startDragRef = React.useRef<{ clientX: number, clientY: number, initialRotateX: number, initialRotateY: number } | null>(null);

  // Use a ref to track the previous polyCube to detect actual changes
  const prevPolyCubeRef = React.useRef<PolyCube | null>(null);

  // Removed helper to check if a block is highlighted
  // const isBlockHighlighted = React.useCallback((block: BlockCoordinates) => {
  //   return highlightedBlocks.some(
  //     hb => hb.x === block.x && hb.y === block.y && hb.z === block.z
  //   );
  // }, [highlightedBlocks]);

  React.useEffect(() => {
    // Reset rotation angles if the underlying shape (polyCube) has changed
    // This ensures a new shape or a 90-degree rotated shape starts from a "fresh" view.
    // Deep comparison is needed for polyCube as it's an array.
    const isPolyCubeChanged = JSON.stringify(polyCube) !== JSON.stringify(prevPolyCubeRef.current);

    if (isPolyCubeChanged) {
      setRotateXAngle(0);
      setRotateYAngle(0);
      prevPolyCubeRef.current = polyCube;
      // Note: Setting state here will cause another re-render with the reset angles, which is desired.
      return; // Exit current effect run to avoid drawing with outdated angles
    }


    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!polyCube || polyCube.length === 0 || calculateDimensions(polyCube).width === 0) {
      ctx.fillStyle = ISO_COLORS.stroke;
      ctx.font = '16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Click "New Example"', canvas.width / 2, canvas.height / 2);
      ctx.fillText('to load a shape!', canvas.width / 2, canvas.height / 2 + 20);
      return;
    }

    // 1. Collect all active blocks with their rotated coordinates and a depth key
    const activeBlocks: DrawableBlock[] = [];
    let minShapeX = Infinity, maxShapeX = -Infinity;
    let minShapeY = Infinity, maxShapeY = -Infinity;
    let minShapeZ = Infinity, maxShapeZ = -Infinity;

    for (let x = 0; x < GRID_SIZE; x++) {
      for (let y = 0; y < GRID_SIZE; y++) {
        for (let z = 0; z < GRID_SIZE; z++) {
          if (polyCube[x] && polyCube[x][y] && polyCube[x][y][z] === 1) { // Null-safe check
            // Use block center for rotation and depth sorting for better consistency
            const rotatedCenter = applyRotation(x + 0.5, y + 0.5, z + 0.5, rotateXAngle, rotateYAngle);
            activeBlocks.push({
              originalX: x, originalY: y, originalZ: z,
              rotatedX: rotatedCenter.x, rotatedY: rotatedCenter.y, rotatedZ: rotatedCenter.z,
              // Simple depth key: sum of rotated coordinates (further away = smaller sum in this projection)
              depth: rotatedCenter.x + rotatedCenter.y + rotatedCenter.z,
            });
            // Update overall shape bounding box in original coordinates
            minShapeX = Math.min(minShapeX, x);
            maxShapeX = Math.max(maxShapeX, x + 1); // +1 because block occupies [x, x+1]
            minShapeY = Math.min(minShapeY, y);
            maxShapeY = Math.max(maxShapeY, y + 1);
            minShapeZ = Math.min(minShapeZ, z);
            maxShapeZ = Math.max(maxShapeZ, z + 1);
          }
        }
      }
    }

    // 2. Sort blocks from back to front based on their depth
    activeBlocks.sort((a, b) => a.depth - b.depth);

    let minProjectedX = Infinity, maxProjectedX = -Infinity;
    let minProjectedY = Infinity, maxProjectedY = -Infinity;

    // 3. Calculate the overall projected bounding box after rotation and before global translation
    if (minShapeX === Infinity) { // No blocks found (should be caught by initial check, but for robustness)
      minProjectedX = maxProjectedX = 0;
      minProjectedY = maxProjectedY = 0;
    } else {
      // Define the 8 corners of the overall 3D bounding box of the shape
      const shapeBoundingBoxCorners3D = [
        { x: minShapeX, y: minShapeY, z: minShapeZ },
        { x: maxShapeX, y: minShapeY, z: minShapeZ },
        { x: minShapeX, y: maxShapeY, z: minShapeZ },
        { x: minShapeX, y: minShapeY, z: maxShapeZ },
        { x: maxShapeX, y: maxShapeY, z: minShapeZ },
        { x: maxShapeX, y: minShapeY, z: maxShapeZ },
        { x: minShapeX, y: maxShapeY, z: maxShapeZ },
        { x: maxShapeX, y: maxShapeY, z: maxShapeZ },
      ];

      // Apply current rotation to each 3D bounding box corner, then project to 2D isometric
      const projectedShapeCorners2D = shapeBoundingBoxCorners3D
        .map(oc => applyRotation(oc.x, oc.y, oc.z, rotateXAngle, rotateYAngle))
        .map(rc => map3DToRawIsometric(rc.x, rc.y, rc.z, ISOMETRIC_BLOCK_SIZE));

      for (const p of projectedShapeCorners2D) {
        minProjectedX = Math.min(minProjectedX, p.x);
        maxProjectedX = Math.max(maxProjectedX, p.x);
        minProjectedY = Math.min(minProjectedY, p.y);
        maxProjectedY = Math.max(maxProjectedY, p.y);
      }
    }

    const shapeProjectedWidth = maxProjectedX - minProjectedX;
    const shapeProjectedHeight = maxProjectedY - minProjectedY;

    // Calculate translation needed to center the *projected bounding box* on the canvas
    const translateX = (ISOMETRIC_CANVAS_SIZE / 2) - (minProjectedX + shapeProjectedWidth / 2);
    const translateY = (ISOMETRIC_CANVAS_SIZE / 2) - (minProjectedY + shapeProjectedHeight / 2);

    // Draw axes *before* blocks so they appear underneath
    drawAxes(ctx, ISOMETRIC_BLOCK_SIZE, translateX, translateY, rotateXAngle, rotateYAngle);

    // 4. Second pass: Draw each block in the sorted order
    for (const block of activeBlocks) {
      const { originalX, originalY, originalZ } = block;

      drawIsometricBlockFaces(
          ctx, polyCube, originalX, originalY, originalZ, ISO_COLORS,
          ISOMETRIC_BLOCK_SIZE, translateX, translateY,
          rotateXAngle, rotateYAngle // Pass current rotation angles for internal use
          // Removed isBlockHighlighted({ x: originalX, y: originalY, z: originalZ }) // Pass highlight status
      );
    }
  }, [polyCube, rotateXAngle, rotateYAngle]); // Re-run when polyCube OR angles change (removed isBlockHighlighted)

  const handleMouseDown = React.useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    startDragRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      initialRotateX: rotateXAngle,
      initialRotateY: rotateYAngle,
    };
    e.preventDefault(); // Prevent default browser drag behavior
  }, [rotateXAngle, rotateYAngle]);

  const handleMouseMove = React.useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging || !startDragRef.current) return;

    const deltaX = e.clientX - startDragRef.current.clientX;
    // const deltaY = e.clientY - startDragRef.current.clientY; // Not used for vertical rotation

    setRotateYAngle(startDragRef.current.initialRotateY + deltaX * ROTATION_SENSITIVITY);
    // Removed vertical rotation: setRotateXAngle(startDragRef.current.initialRotateX + deltaY * ROTATION_SENSITIVITY); 
    e.preventDefault();
  }, [isDragging]);

  const handleMouseUp = React.useCallback(() => {
    setIsDragging(false);
    startDragRef.current = null;
  }, []);

  const handleMouseLeave = React.useCallback(() => {
    // If mouse leaves the canvas while dragging, stop dragging
    if (isDragging) {
      setIsDragging(false);
      startDragRef.current = null;
    }
  }, [isDragging]);


  return (
    <div className={`relative flex flex-col items-center justify-center p-2 bg-gray-50 border border-gray-300 rounded-lg shadow-inner w-full h-full min-h-[${VIEWPORT_SIZE}px]`}>
      <canvas
        ref={canvasRef}
        width={ISOMETRIC_CANVAS_SIZE}
        height={ISOMETRIC_CANVAS_SIZE}
        className={`block bg-white border-2 border-gray-700 rounded-md shadow-md ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      ></canvas>
      {/* Removed static corner labels */}
      <p className="mt-2 text-sm text-gray-600">Drag the 3D model horizontally to rotate its view.</p>
    </div>
  );
};

export default IsometricView;
