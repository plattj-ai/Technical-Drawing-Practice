
import React from 'react';
import { OrthographicGridState, ViewType } from '../types';
import { GRID_SIZE, CELL_SIZE, CELL_FILL_COLOR, CELL_STROKE_COLOR, VIEWPORT_SIZE, AXIS_LABEL_PADDING, ISO_COLORS } from '../constants'; // Import ISO_COLORS

interface OrthographicGridProps {
  viewType: ViewType;
  gridState: OrthographicGridState;
  onCellToggle: (row: number, col: number, view: ViewType) => void;
  solutionState: OrthographicGridState | null; // For drawing alignment anchors
  label: string;
  // Removed onCellHover: (row: number | null, col: number | null, view: ViewType, isHovering: boolean) => void; // For 2D-to-3D highlight
}

/**
 * Calculates the actual bounding box dimensions (width, height) of filled cells in a 2D grid.
 * @param grid The 2D array representing the orthographic view.
 * @returns An object containing the width and height of the filled area.
 */
function get2DGridDimensions(grid: OrthographicGridState): { width: number, height: number } {
  let minR = GRID_SIZE, maxR = -1;
  let minC = GRID_SIZE, maxC = -1;

  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (grid[r] && grid[r][c] === 1) { // Check if row and cell exist
        minR = Math.min(minR, r);
        maxR = Math.max(maxR, r);
        minC = Math.min(minC, c);
        maxC = Math.max(maxC, c);
      }
    }
  }

  if (maxR === -1) { // Empty grid
    return { width: 0, height: 0 };
  }

  return {
    width: maxC - minC + 1,
    height: maxR - minR + 1,
  };
}


const OrthographicGrid: React.FC<OrthographicGridProps> = ({
  viewType,
  gridState,
  onCellToggle,
  solutionState,
  label,
  // Removed onCellHover,
}) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  // Removed hoveredCell ref
  // const hoveredCell = React.useRef<{ row: number; col: number } | null>(null); // Track currently hovered cell

  const drawGrid = (ctx: CanvasRenderingContext2D) => {
    ctx.strokeStyle = '#cbd5e1'; // Gray-300
    ctx.lineWidth = 1;
    for (let i = 0; i <= GRID_SIZE; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CELL_SIZE, 0);
      ctx.lineTo(i * CELL_SIZE, VIEWPORT_SIZE);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * CELL_SIZE);
      ctx.lineTo(VIEWPORT_SIZE, i * CELL_SIZE);
      ctx.stroke();
    }
  };

  const drawCells = (ctx: CanvasRenderingContext2D, drawing: OrthographicGridState) => {
    let fillColor: string;
    let strokeColor: string;

    switch (viewType) {
      case 'front':
        fillColor = ISO_COLORS.front; // Red
        strokeColor = '#b91c1c'; // Darker red
        break;
      case 'top':
        fillColor = ISO_COLORS.top; // Yellow
        strokeColor = '#a16207'; // Darker yellow/orange
        break;
      case 'side':
        fillColor = ISO_COLORS.side; // Blue
        strokeColor = '#1e40af'; // Darker blue
        break;
      default:
        fillColor = CELL_FILL_COLOR; // Fallback to default blue if viewType is unexpected
        strokeColor = CELL_STROKE_COLOR; // Fallback
    }

    ctx.fillStyle = fillColor;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1;
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        if (drawing[row] && drawing[row][col] === 1) {
          ctx.fillRect(col * CELL_SIZE, row * CELL_SIZE, CELL_SIZE, CELL_SIZE);
          ctx.strokeRect(col * CELL_SIZE, row * CELL_SIZE, CELL_SIZE, CELL_SIZE);
        }
      }
    }
  };

  /**
   * Draws thick, colored axes along the borders of the grid with labels.
   * This function draws relative to the *full* canvas dimensions (including padding).
   * @param ctx The canvas rendering context.
   * @param view The type of orthographic view.
   * @param fullCanvasWidth The total width of the canvas (VIEWPORT_SIZE + 2*AXIS_LABEL_PADDING).
   * @param fullCanvasHeight The total height of the canvas.
   * @param axisLabelPadding The padding amount for axes and labels.
   */
  const drawBorderAxesAndLabels = (
    ctx: CanvasRenderingContext2D,
    view: ViewType,
    fullCanvasWidth: number,
    fullCanvasHeight: number,
    axisLabelPadding: number
  ) => {
    const axisThickness = 4; // Thicker lines for axes
    ctx.lineWidth = axisThickness;
    ctx.font = '12px Arial'; // Slightly larger font for labels
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Define axes for each view
    const axesDefinitions = {
      front: [
        { type: 'horizontal', color: '#ef4444', label: 'X', position: 'bottom', direction: 'right' },
        { type: 'vertical', color: '#22c55e', label: 'Y', position: 'left', direction: 'up' },
      ],
      top: [
        // NEW: Z (horizontal, bottom), X (vertical, left)
        { type: 'horizontal', color: '#3b82f6', label: 'Z', position: 'bottom', direction: 'right' }, // Z horizontal (maps to columns)
        { type: 'vertical', color: '#ef4444', label: 'X', position: 'left', direction: 'up' },        // X vertical (maps to rows), inverted
      ],
      side: [
        { type: 'horizontal', color: '#3b82f6', label: 'Z', position: 'bottom', direction: 'right' },
        { type: 'vertical', color: '#22c55e', label: 'Y', position: 'right', direction: 'up' }, // Y axis now on the right
      ],
    };

    const currentViewAxes = axesDefinitions[view];

    currentViewAxes.forEach(axis => {
      ctx.strokeStyle = axis.color;
      ctx.fillStyle = axis.color; // Label color

      ctx.beginPath();
      if (axis.type === 'horizontal') {
        // Draw horizontal axis inside the bottom padding area
        if (axis.position === 'bottom') {
          ctx.moveTo(axisLabelPadding, fullCanvasHeight - axisLabelPadding);
          ctx.lineTo(fullCanvasWidth - axisLabelPadding, fullCanvasHeight - axisLabelPadding);
        }
      } else { // vertical
        if (axis.position === 'left') {
          ctx.moveTo(axisLabelPadding, fullCanvasHeight - axisLabelPadding); // Start from bottom-left corner of grid area
          ctx.lineTo(axisLabelPadding, axisLabelPadding);            // Draw upwards to top-left of grid area
        } else if (axis.position === 'right') {
          ctx.moveTo(fullCanvasWidth - axisLabelPadding, fullCanvasHeight - axisLabelPadding); // Start from bottom-right corner of grid area
          ctx.lineTo(fullCanvasWidth - axisLabelPadding, axisLabelPadding);            // Draw upwards to top-right of grid area
        }
      }
      ctx.stroke();

      // Draw labels
      let labelX, labelY;
      const labelOffset = 10; // Distance from the axis line

      if (axis.type === 'horizontal') { // X or Z horizontal (at bottom)
        labelX = fullCanvasWidth / 2;
        labelY = fullCanvasHeight - axisLabelPadding + (axisLabelPadding - labelOffset) / 2;
        ctx.textBaseline = 'top';
        ctx.textAlign = 'center';
      } else { // Y or Z vertical
        labelY = fullCanvasHeight / 2;
        if (axis.position === 'left') {
          labelX = axisLabelPadding - (axisLabelPadding - labelOffset) / 2;
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
        } else if (axis.position === 'right') {
          labelX = fullCanvasWidth - axisLabelPadding + (axisLabelPadding - labelOffset) / 2;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
        }
      }
      ctx.fillText(axis.label, labelX, labelY);
    });
  };

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const fullCanvasWidth = VIEWPORT_SIZE + AXIS_LABEL_PADDING * 2;
    const fullCanvasHeight = VIEWPORT_SIZE + AXIS_LABEL_PADDING * 2;

    // Set canvas dimensions
    canvas.width = fullCanvasWidth;
    canvas.height = fullCanvasHeight;

    ctx.clearRect(0, 0, fullCanvasWidth, fullCanvasHeight); // Clear the entire canvas

    // 1. Draw border axes (these draw relative to the full canvas, within padding areas)
    drawBorderAxesAndLabels(ctx, viewType, fullCanvasWidth, fullCanvasHeight, AXIS_LABEL_PADDING);

    // 2. Translate context to draw the grid, cells, and anchors within the central VIEWPORT_SIZE area
    ctx.save();
    ctx.translate(AXIS_LABEL_PADDING, AXIS_LABEL_PADDING);

    drawGrid(ctx); // Draw grid lines
    drawCells(ctx, gridState); // Draw student's filled cells

    // Removed the call to drawAlignmentAnchors

    ctx.restore(); // Restore context to original state
  }, [gridState, solutionState, viewType]); // Redraw when gridState, solutionState, viewType change

  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    // Adjust mouse coordinates by subtracting padding to get coordinates relative to the grid area
    const x = (event.clientX - rect.left) - AXIS_LABEL_PADDING;
    const y = (event.clientY - rect.top) - AXIS_LABEL_PADDING;

    const col = Math.floor(x / CELL_SIZE);
    const row = Math.floor(y / CELL_SIZE);

    // Only allow toggling within the actual grid area
    if (row >= 0 && row < GRID_SIZE && col >= 0 && col < GRID_SIZE) {
      onCellToggle(row, col, viewType);
    }
  };

  // Removed handleMouseMove and handleMouseLeave callbacks
  // const handleMouseMove = React.useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
  //   const canvas = canvasRef.current;
  //   if (!canvas) return;

  //   const rect = canvas.getBoundingClientRect();
  //   // Adjust mouse coordinates by subtracting padding
  //   const x = (event.clientX - rect.left) - AXIS_LABEL_PADDING;
  //   const y = (event.clientY - rect.top) - AXIS_LABEL_PADDING;

  //   const col = Math.floor(x / CELL_SIZE);
  //   const row = Math.floor(y / CELL_SIZE);

  //   // Check if mouse is within the actual grid area
  //   if (row >= 0 && row < GRID_SIZE && col >= 0 && col < GRID_SIZE) {
  //     // Check if the hovered cell has actually changed
  //     if (hoveredCell.current?.row !== row || hoveredCell.current?.col !== col) {
  //       // If there was a previously hovered cell, "un-hover" it
  //       if (hoveredCell.current && gridState[hoveredCell.current.row]?.[hoveredCell.current.col] === 1) {
  //         onCellHover(hoveredCell.current.row, hoveredCell.current.col, viewType, false);
  //       }
  //       // "Hover" the new cell if it's filled in the student's drawing
  //       if (gridState[row] && gridState[row][col] === 1) {
  //         onCellHover(row, col, viewType, true);
  //         hoveredCell.current = { row, col };
  //       } else {
  //         // If the new cell is empty, clear hoveredCell and ensure no highlight
  //         hoveredCell.current = null;
  //         onCellHover(null, null, viewType, false); // Clear any highlight
  //       }
  //     }
  //   } else {
  //     // Mouse is outside grid area, clear any hovered cell
  //     if (hoveredCell.current) {
  //       onCellHover(hoveredCell.current.row, hoveredCell.current.col, viewType, false);
  //       hoveredCell.current = null;
    // }
  // }
  // }, [gridState, viewType, onCellHover]);


  // const handleMouseLeave = React.useCallback(() => {
  //   if (hoveredCell.current) {
  //     onCellHover(hoveredCell.current.row, hoveredCell.current.col, viewType, false);
  //     hoveredCell.current = null;
  //   }
  // }, [viewType, onCellHover]);

  // Total dimensions of the canvas including padding for axes
  const fullCanvasHeight = VIEWPORT_SIZE + AXIS_LABEL_PADDING * 2;

  return (
    <div className={`flex flex-col items-center p-4 bg-gray-50 border border-gray-200 rounded-lg shadow-sm w-full h-full min-h-[${fullCanvasHeight}px]`}>
      <div className="relative w-full h-full flex items-center justify-center"> {/* Centering container for canvas and label */}
        <canvas
          ref={canvasRef}
          // Width and Height are set in useEffect for dynamic calculation
          className="block bg-white border-2 border-gray-500 cursor-pointer"
          onClick={handleClick}
          // Removed onMouseMove={handleMouseMove}
          // Removed onMouseLeave={handleMouseLeave}
        ></canvas>
        <span className="absolute top-0 left-1/2 -translate-x-1/2 text-gray-700 font-semibold text-sm">{label}</span>
      </div>
    </div>
  );
};

export default OrthographicGrid;