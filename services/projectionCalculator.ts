
import { PolyCube, Dimensions, OrthographicViews, OrthographicGridState, ViewOffsets, BlockCoordinates, ViewType } from '../types';
import { GRID_SIZE, VIEWPORT_SIZE } from '../constants'; // Import VIEWPORT_SIZE

/**
 * Calculates the bounding box dimensions (width, height, depth) of a given polyCube.
 * @param polyCube The 3D array representing the shape.
 * @returns An object containing width, height, and depth.
 */
export function calculateDimensions(polyCube: PolyCube): Dimensions {
  let minX = GRID_SIZE, maxX = -1;
  let minY = GRID_SIZE, maxY = -1;
  let minZ = GRID_SIZE, maxZ = -1;

  for (let x = 0; x < GRID_SIZE; x++) {
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        if (polyCube[x] && polyCube[x][y] && polyCube[x][y][z] === 1) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
          minZ = Math.min(minZ, z);
          maxZ = Math.max(maxZ, z);
        }
      }
    }
  }

  // If no blocks, return 0 dimensions
  if (maxX === -1) {
    return { width: 0, height: 0, depth: 0 };
  }

  // Dimensions are (max index - min index + 1)
  return {
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    depth: maxZ - minZ + 1,
  };
}

/**
 * Creates an empty 2D grid of specified dimensions.
 * @param rows Number of rows.
 * @param cols Number of columns.
 * @returns A 2D array filled with zeros.
 */
function createEmptyGrid(rows: number, cols: number): OrthographicGridState {
  return Array(rows).fill(0).map(() => Array(cols).fill(0));
}

/**
 * Calculates the orthographic projections (Front, Top, Side) for a given polyCube.
 * @param polyCube The 3D array representing the shape.
 * @param dimensions The calculated dimensions of the polyCube.
 * @returns An object containing the front, top, and side view grids, along with their centering offsets.
 */
export function calculateOrthographicProjections(
  polyCube: PolyCube,
  dimensions: Dimensions
): OrthographicViews {
  const { width, height, depth } = dimensions;

  if (width === 0 || height === 0 || depth === 0) {
    return {
      front: createEmptyGrid(GRID_SIZE, GRID_SIZE),
      top: createEmptyGrid(GRID_SIZE, GRID_SIZE),
      side: createEmptyGrid(GRID_SIZE, GRID_SIZE),
      frontOffsets: {x:0, y:0}, topOffsets: {x:0, y:0}, sideOffsets: {x:0, y:0}
    };
  }

  // Initialize views with the maximum possible grid size for consistent canvas drawing
  // We'll center the actual projection within these larger grids
  let frontView = createEmptyGrid(GRID_SIZE, GRID_SIZE);
  let topView = createEmptyGrid(GRID_SIZE, GRID_SIZE);
  let sideView = createEmptyGrid(GRID_SIZE, GRID_SIZE);

  // Calculate offsets to center the projection within the larger GRID_SIZE canvas
  // These offsets are in terms of 'cells' relative to the 8x8 grid, NOT pixels.
  const offsetXFront = Math.floor((GRID_SIZE - width) / 2);
  const offsetYFront = Math.floor((GRID_SIZE - height) / 2); // offsetYFront is padding from top

  // For Top View:
  // UI now shows X on vertical (rows) and Z on horizontal (cols)
  // So, the grid's "height" (rows) should accommodate the 3D "width" (X dimension)
  // and the grid's "width" (cols) should accommodate the 3D "depth" (Z dimension).
  const offsetXTop = Math.floor((GRID_SIZE - depth) / 2); // Top view cols map to Z (depth)
  const offsetYTop = Math.floor((GRID_SIZE - width) / 2); // Top view rows map to X (width)

  const offsetXSide = Math.floor((GRID_SIZE - depth) / 2); // Side view uses depth for columns
  const offsetYSide = Math.floor((GRID_SIZE - height) / 2); // Side view uses height for rows, offsetYSide is padding from top


  for (let x = 0; x < GRID_SIZE; x++) {
    for (let y = 0; y < GRID_SIZE; y++) { // y is height
      for (let z = 0; z < GRID_SIZE; z++) { // z is depth
        if (polyCube[x] && polyCube[x][y] && polyCube[x][y][z] === 1) {
          // Front View (X-Y plane, looking from positive Z): row = (height - 1 - y), col = x
          // Map to canvas coords: row = GRID_SIZE - 1 - (y + offsetYFront), col = x + offsetXFront
          const frontRow = GRID_SIZE - 1 - (y + offsetYFront);
          const frontCol = x + offsetXFront;
          if (frontRow >= 0 && frontRow < GRID_SIZE && frontCol >= 0 && frontCol < GRID_SIZE) {
            frontView[frontRow][frontCol] = 1;
          }

          // Top View (X-Z plane, looking from positive Y): row = x, col = z (NEW MAPPING)
          // Map to canvas coords: row = x + offsetYTop, col = z + offsetXTop
          const topRow = x + offsetYTop; // Now maps to X
          const topCol = z + offsetXTop; // Now maps to Z
          if (topRow >= 0 && topRow < GRID_SIZE && topCol >= 0 && topCol < GRID_SIZE) {
            topView[topRow][topCol] = 1;
          }

          // Side View (Y-Z plane, looking from positive X): row = (height - 1 - y), col = z
          // Map to canvas coords: row = GRID_SIZE - 1 - (y + offsetYSide), col = z + offsetXSide
          const sideRow = GRID_SIZE - 1 - (y + offsetYSide);
          const sideCol = z + offsetXSide;
          if (sideRow >= 0 && sideRow < GRID_SIZE && sideCol >= 0 && sideCol < GRID_SIZE) {
            sideView[sideRow][sideCol] = 1;
          }
        }
      }
    }
  }

  return {
    front: frontView,
    top: topView,
    side: sideView,
    frontOffsets: {x: offsetXFront, y: offsetYFront},
    topOffsets: {x: offsetXTop, y: offsetYTop},
    sideOffsets: {x: offsetXSide, y: offsetYSide},
  };
}


/**
 * Given a 2D cell (row, col) in a specific orthographic view,
 * find all 3D blocks in the polyCube that project onto that cell.
 *
 * @param polyCube The 3D shape.
 * @param viewType The type of orthographic view ('front', 'top', 'side').
 * @param row The row index of the 2D cell.
 * @param col The column index of the 2D cell.
 * @param viewOffsets The offsets used to center the 2D projection on the grid.
 * @param dimensions The dimensions of the 3D shape.
 * @returns An array of BlockCoordinates that project to the given 2D cell.
 */
export function find3DBlocksFor2DCell(
  polyCube: PolyCube,
  viewType: ViewType,
  row: number,
  col: number,
  viewOffsets: ViewOffsets,
  dimensions: Dimensions
): BlockCoordinates[] {
  const contributingBlocks: BlockCoordinates[] = [];
  const { width, height, depth } = dimensions;

  // Reverse apply offsets to get the cell's coordinate relative to the *shape's* bounding box.
  const relativeCol = col - viewOffsets.x;
  let relativeRow = row - viewOffsets.y;

  // The 2D projections are often centered and inverted on Y for front/side views.
  // We need to map the 2D (relativeRow, relativeCol) back to 3D (x,y,z) ranges.

  for (let x = 0; x < GRID_SIZE; x++) {
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        if (polyCube[x] && polyCube[x][y] && polyCube[x][y][z] === 1) {
          switch (viewType) {
            case 'front':
              // Front View: 2D row = GRID_SIZE - 1 - (y + offsetYFront), 2D col = x + offsetXFront
              // So, for a given 2D (row, col) relative to grid:
              // 3D x = col - offsetXFront
              // 3D y = GRID_SIZE - 1 - row - offsetYFront
              const targetFrontX = col - viewOffsets.x;
              const targetFrontY = GRID_SIZE - 1 - row - viewOffsets.y; // Correctly map canvas row to 3D Y
              if (x === targetFrontX && y === targetFrontY) {
                  contributingBlocks.push({ x, y, z });
              }
              break;
            case 'top':
              // Top View (NEW MAPPING): 2D row = x + offsetYTop, 2D col = z + offsetXTop
              // So, for a given 2D (row, col) relative to grid:
              // 3D x = row - offsetYTop
              // 3D z = col - offsetXTop
              const targetTopX = row - viewOffsets.y; // Now maps 2D row back to 3D X
              const targetTopZ = col - viewOffsets.x; // Now maps 2D col back to 3D Z
              if (x === targetTopX && z === targetTopZ) {
                  contributingBlocks.push({ x, y, z });
              }
              break;
            case 'side':
              // Side View: 2D row = GRID_SIZE - 1 - (y + offsetYSide), 2D col = z + offsetXSide
              // 3D z = col - offsetXSide
              // 3D y = GRID_SIZE - 1 - row - offsetYSide
              const targetSideZ = col - viewOffsets.x;
              const targetSideY = GRID_SIZE - 1 - row - viewOffsets.y; // Correctly map canvas row to 3D Y
              if (z === targetSideZ && y === targetSideY) {
                  contributingBlocks.push({ x, y, z });
              }
              break;
          }
        }
      }
    }
  }
  return contributingBlocks;
}
