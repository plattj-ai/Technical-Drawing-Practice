
export interface BlockCoordinates {
  x: number;
  y: number; // Height axis
  z: number; // Depth axis
}

export type PolyCube = number[][][]; // 3D array: [x][y][z] -> 1 (block) or 0 (empty)

export type OrthographicGridState = number[][]; // 2D array: [row][col] -> 1 (filled) or 0 (empty)

export interface ViewOffsets {
  x: number; // Column offset from the left edge of the grid
  y: number; // Row offset from the top edge of the grid
}

export interface OrthographicViews {
  front: OrthographicGridState;
  top: OrthographicGridState;
  side: OrthographicGridState;
  frontOffsets?: ViewOffsets; // Optional offsets for centering the shape in the front view
  topOffsets?: ViewOffsets;   // Optional offsets for centering the shape in the top view
  sideOffsets?: ViewOffsets;  // Optional offsets for centering the shape in the side view
}

export interface Dimensions {
  width: number;
  height: number;
  depth: number;
}

export interface Shape {
  polyCube: PolyCube;
  views: OrthographicViews;
  dimensions: Dimensions;
}

export interface FeedbackMessage {
  type: 'success' | 'error' | 'hint' | 'info';
  text: string;
}

export enum Level {
  LEVEL_1 = 'Level 1: Simple',
  LEVEL_2 = 'Level 2: Intermediate',
  LEVEL_3 = 'Level 3: Advanced',
}

export type ViewType = 'front' | 'top' | 'side';

export enum ProgressionStageStatus {
  IN_PROGRESS = 'in-progress',
  COMPLETED = 'completed',
  NOT_STARTED = 'not-started',
}

export interface ProgressionStep {
  id: string; // Unique ID for the step, e.g., "L1_1"
  level: Level;
  description: string; // e.g., "Simple Shape 1/2"
}
