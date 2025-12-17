
import { PolyCube, BlockCoordinates, Dimensions, Level } from '../types';
import { GRID_SIZE, BLOCK_COUNTS_BY_LEVEL, MAX_REGEN_ATTEMPTS } from '../constants';
import { calculateDimensions } from './projectionCalculator';

/**
 * Shifts a polyCube so its minimum x, y, z coordinates are 0.
 * @param polyCube The polyCube to normalize.
 * @returns A new, normalized polyCube.
 */
function normalizePolyCube(polyCube: PolyCube): PolyCube {
  let minX = GRID_SIZE, minY = GRID_SIZE, minZ = GRID_SIZE;
  const blocks: BlockCoordinates[] = [];

  for (let x = 0; x < GRID_SIZE; x++) {
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        if (polyCube[x] && polyCube[x][y] && polyCube[x][y][z] === 1) {
          blocks.push({ x, y, z });
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          minZ = Math.min(minZ, z);
        }
      }
    }
  }

  const normalizedPolyCube = Array(GRID_SIZE).fill(0).map(() =>
    Array(GRID_SIZE).fill(0).map(() =>
      Array(GRID_SIZE).fill(0)
    )
  );

  blocks.forEach(block => {
    const newX = block.x - minX;
    const newY = block.y - minY;
    const newZ = block.z - minZ;
    normalizedPolyCube[newX][newY][newZ] = 1;
  });

  return normalizedPolyCube;
}

/**
 * Generates a random, valid, contiguous isometric shape (polyCube).
 * The shape is normalized and constrained to fit within GRID_SIZE.
 * @param level The difficulty level, influencing block count and complexity.
 * @returns A generated polyCube, or null if generation fails after max attempts.
 */
export function generateContiguousShape(level: Level): PolyCube | null {
  const { min, max } = BLOCK_COUNTS_BY_LEVEL[level];
  const targetBlocks = Math.floor(Math.random() * (max - min + 1)) + min;

  let attempts = 0;
  while (attempts < MAX_REGEN_ATTEMPTS) {
    let tempBlockMap = new Map<string, boolean>();
    let existingBlocks: BlockCoordinates[] = [];

    // Start with a single block at a random valid position within the lower part of the grid
    let startX = Math.floor(Math.random() * (GRID_SIZE / 2));
    let startY = 0; // Always start at the bottom for easier visualization
    let startZ = Math.floor(Math.random() * (GRID_SIZE / 2));
    const startKey = `${startX},${startY},${startZ}`;
    tempBlockMap.set(startKey, true);
    existingBlocks.push({ x: startX, y: startY, z: startZ });

    const neighbors = [
      { dx: 1, dy: 0, dz: 0 }, { dx: -1, dy: 0, dz: 0 },
      { dx: 0, dy: 1, dz: 0 }, { dy: -1, dx: 0, dz: 0 }, // Allow adding blocks below but try to build up
      { dx: 0, dy: 0, dz: 1 }, { dz: -1, dx: 0, dy: 0 },
    ];

    // Iteratively grow the shape
    for (let count = 1; count < targetBlocks; count++) {
      let potentialPoints: BlockCoordinates[] = [];
      let potentialPointsSet = new Set<string>();

      for (const { x, y, z } of existingBlocks) {
        for (const { dx, dy, dz } of neighbors) {
          let nx = x + dx;
          let ny = y + dy;
          let nz = z + dz;
          const pointKey = `${nx},${ny},${nz}`;

          // Check bounds
          if (nx >= 0 && nx < GRID_SIZE &&
            ny >= 0 && ny < GRID_SIZE &&
            nz >= 0 && nz < GRID_SIZE &&
            !tempBlockMap.has(pointKey) &&
            !potentialPointsSet.has(pointKey)) {
            potentialPoints.push({ x: nx, y: ny, z: nz });
            potentialPointsSet.add(pointKey);
          }
        }
      }

      if (potentialPoints.length === 0) {
        // Cannot add more blocks, break and try again
        break;
      }

      // Prioritize adding blocks upwards (higher Y) for more interesting shapes
      // or blocks that expand the silhouette
      potentialPoints.sort((a, b) => {
        // Simple heuristic: prefer higher blocks, or blocks that expand max dimensions
        return (b.y - a.y);
      });

      const nextBlock = potentialPoints[Math.floor(Math.random() * Math.min(potentialPoints.length, 5))]; // Pick from top 5 for some randomness but bias
      if (!nextBlock) {
        break;
      }

      tempBlockMap.set(`${nextBlock.x},${nextBlock.y},${nextBlock.z}`, true);
      existingBlocks.push(nextBlock);
    }

    // Ensure enough blocks were generated
    if (existingBlocks.length < min) {
      attempts++;
      continue;
    }

    // Convert to polyCube format for normalization and dimension check
    let currentPolyCube: PolyCube = Array(GRID_SIZE).fill(0).map(() =>
      Array(GRID_SIZE).fill(0).map(() =>
        Array(GRID_SIZE).fill(0)
      )
    );
    existingBlocks.forEach(({ x, y, z }) => {
      currentPolyCube[x][y][z] = 1;
    });

    const normalizedPolyCube = normalizePolyCube(currentPolyCube);
    const dimensions = calculateDimensions(normalizedPolyCube);

    // Check if the normalized shape fits within the GRID_SIZE dimensions
    if (dimensions.width > GRID_SIZE || dimensions.height > GRID_SIZE || dimensions.depth > GRID_SIZE || dimensions.width === 0) {
      attempts++;
      continue; // Shape is too large or empty, try again
    }

    return normalizedPolyCube;
  }

  console.warn(`Failed to generate a contiguous shape for ${level} after ${MAX_REGEN_ATTEMPTS} attempts.`);
  return null; // Return null if unable to generate a valid shape
}

/**
 * Rotates the 3D block structure 90 degrees clockwise around the Y-axis.
 * This function is no longer used directly in App.tsx after the removal of the "Rotate View 90°" button.
 * It is kept here for reference or potential future use if a similar rotation mechanism is desired.
 * @param polyCube The original polyCube.
 * @returns A new polyCube representing the rotated shape.
 */
export function rotatePolyCube90(polyCube: PolyCube): PolyCube {
  const newPolyCube: PolyCube = Array(GRID_SIZE).fill(0).map(() =>
    Array(GRID_SIZE).fill(0).map(() =>
      Array(GRID_SIZE).fill(0)
    )
  );

  for (let x = 0; x < GRID_SIZE; x++) {
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        if (polyCube[x] && polyCube[x][y] && polyCube[x][y][z] === 1) {
          // 90 degree rotation around Y-axis (vertical, Y stays the same):
          // newX = z
          // newZ = GRID_SIZE - 1 - x (reflect across the Z-axis, then swap X and Z)
          // Simplified: The newX is the oldZ, and the newZ is the oldX's 'opposite' coordinate.

          const newX = z;
          const newY = y;
          const newZ = (GRID_SIZE - 1) - x;

          if (newX >= 0 && newX < GRID_SIZE && newZ >= 0 && newZ < GRID_SIZE) {
            newPolyCube[newX][newY][newZ] = 1;
          }
        }
      }
    }
  }

  // Normalize the rotated shape to ensure its origin is at (0,0,0)
  return normalizePolyCube(newPolyCube);
}