
import React from 'react';
import IsometricView from './components/IsometricView';
import OrthographicGrid from './components/OrthographicGrid';
import {
  Shape, OrthographicGridState, FeedbackMessage, Level, OrthographicViews, ViewType, BlockCoordinates, ProgressionStep
} from './types';
import { generateContiguousShape, /* rotatePolyCube90 */ } from './services/shapeGenerator'; // Removed rotatePolyCube90 import
import { calculateDimensions, calculateOrthographicProjections, find3DBlocksFor2DCell } from './services/projectionCalculator';
import { askTutor } from './services/geminiService';
import { GRID_SIZE, VIEWPORT_SIZE, AXIS_LABEL_PADDING } from './constants'; // Import VIEWPORT_SIZE and AXIS_LABEL_PADDING

/**
 * Normalizes a 2D grid by shifting its contents so the top-leftmost filled cell is at (0,0)
 * of a new, tightly-fitting grid.
 * @param grid The 2D array representing the orthographic view.
 * @returns An object containing the normalized grid and its actual dimensions (width, height).
 */
function normalize2DGrid(grid: OrthographicGridState): { normalizedGrid: OrthographicGridState, dimensions: { width: number, height: number } } {
  let minR = GRID_SIZE, maxR = -1;
  let minC = GRID_SIZE, maxC = -1;
  const filledCells: { r: number, c: number }[] = [];

  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (grid[r] && grid[r][c] === 1) {
        filledCells.push({ r, c });
        minR = Math.min(minR, r);
        maxR = Math.max(maxR, r);
        minC = Math.min(minC, c);
        maxC = Math.max(maxC, c);
      }
    }
  }

  if (filledCells.length === 0) {
    return { normalizedGrid: [], dimensions: { width: 0, height: 0 } }; // Return empty if no blocks
  }

  const width = maxC - minC + 1;
  const height = maxR - minR + 1;

  // Create a new grid for the normalized shape
  const normalizedGrid = Array(height).fill(0).map(() => Array(width).fill(0));

  filledCells.forEach(({ r, c }) => {
    const newR = r - minR;
    const newC = c - minC;
    normalizedGrid[newR][newC] = 1;
  });

  return { normalizedGrid, dimensions: { width, height } };
}

// Define the progression sequence
const PROGRESSION_SEQUENCE: ProgressionStep[] = [
  { id: 'L1_1', level: Level.LEVEL_1, description: 'Simple Shape 1/2' },
  { id: 'L1_2', level: Level.LEVEL_1, description: 'Simple Shape 2/2' },
  { id: 'L2_1', level: Level.LEVEL_2, description: 'Intermediate Shape 1/2' },
  { id: 'L2_2', level: Level.LEVEL_2, description: 'Intermediate Shape 2/2' },
  { id: 'L3_1', level: Level.LEVEL_3, description: 'Advanced Shape 1/2' },
  { id: 'L3_2', level: Level.LEVEL_3, description: 'Advanced Shape 2/2' },
];


const App: React.FC = () => {
  const [currentShape, setCurrentShape] = React.useState<Shape | null>(null);
  const [studentDrawings, setStudentDrawings] = React.useState<OrthographicViews>({
    front: Array(GRID_SIZE).fill(0).map(() => Array(GRID_SIZE).fill(0)),
    top: Array(GRID_SIZE).fill(0).map(() => Array(GRID_SIZE).fill(0)),
    side: Array(GRID_SIZE).fill(0).map(() => Array(GRID_SIZE).fill(0)),
  });
  const [feedback, setFeedback] = React.useState<FeedbackMessage | null>(null);
  const [currentLevel, setCurrentLevel] = React.useState<Level>(Level.LEVEL_1); // For free play mode
  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  const [isTutoring, setIsTutoring] = React.useState<boolean>(false);
  // Removed highlightedBlocks state
  // const [highlightedBlocks, setHighlightedBlocks] = React.useState<BlockCoordinates[]>([]);

  // New state for progression
  const [isProgressionActive, setIsProgressionActive] = React.useState<boolean>(false);
  const [currentProgressionIndex, setCurrentProgressionIndex] = React.useState<number>(-1); // -1 means not active
  const [showCompletionBadge, setShowCompletionBadge] = React.useState<boolean>(false);


  // Initialize student drawings
  const initializeStudentDrawings = React.useCallback(() => {
    setStudentDrawings({
      front: Array(GRID_SIZE).fill(0).map(() => Array(GRID_SIZE).fill(0)),
      top: Array(GRID_SIZE).fill(0).map(() => Array(GRID_SIZE).fill(0)),
      side: Array(GRID_SIZE).fill(0).map(() => Array(GRID_SIZE).fill(0)),
    });
  }, []);

  const generateNewShape = React.useCallback(async (levelToGenerate?: Level) => {
    setIsLoading(true);
    setFeedback(null);
    // Removed setHighlightedBlocks([]); // Clear highlights for new shape
    setShowCompletionBadge(false); // Hide badge when new shape is generated

    const effectiveLevel = levelToGenerate || currentLevel;

    let newPolyCube = generateContiguousShape(effectiveLevel);
    if (!newPolyCube) {
      setFeedback({ type: 'error', text: 'Failed to generate a shape. Please try again or lower the level.' });
      setIsLoading(false);
      return;
    }
    const dimensions = calculateDimensions(newPolyCube);
    const { front, top, side, frontOffsets, topOffsets, sideOffsets } = calculateOrthographicProjections(newPolyCube, dimensions);

    setCurrentShape({
      polyCube: newPolyCube,
      views: { front, top, side, frontOffsets, topOffsets, sideOffsets },
      dimensions
    });
    initializeStudentDrawings();
    setIsLoading(false);
  }, [currentLevel, initializeStudentDrawings]);

  // Effect to generate the initial shape or when level changes in free-play mode
  React.useEffect(() => {
    if (!isProgressionActive) {
      generateNewShape();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLevel, isProgressionActive]); // Regenerate shape when level changes or progression mode changes

  const handleCellToggle = React.useCallback((row: number, col: number, viewType: ViewType) => {
    setStudentDrawings(prev => {
      const newGrid = prev[viewType].map((r, rIdx) =>
        rIdx === row ? r.map((c, cIdx) => (cIdx === col ? (c === 1 ? 0 : 1) : c)) : r
      );
      return { ...prev, [viewType]: newGrid };
    });
    setFeedback(null); // Clear feedback on drawing change
  }, []);

  const validateDrawing = React.useCallback(() => {
    if (!currentShape) {
      setFeedback({ type: 'error', text: 'No shape loaded. Please generate a new example.' });
      return;
    }

    let allCorrect = true;
    const incorrectViews: ViewType[] = [];
    const feedbackDetails: string[] = [];

    const views: ViewType[] = ['front', 'top', 'side'];

    views.forEach(view => {
      const { normalizedGrid: studentNormalized, dimensions: studentDims } = normalize2DGrid(studentDrawings[view]);
      const { normalizedGrid: solutionNormalized, dimensions: solutionDims } = normalize2DGrid(currentShape.views[view]);

      let viewCorrect = true;
      let diffDetails = '';

      // First, compare overall dimensions of the normalized shapes
      if (studentDims.width !== solutionDims.width || studentDims.height !== solutionDims.height) {
        viewCorrect = false;
        diffDetails = `The overall outline (width/height) of your ${view} view doesn't match.`;
      } else {
        // Then, compare cell by cell of the normalized shapes
        for (let r = 0; r < solutionDims.height; r++) {
          for (let c = 0; c < solutionDims.width; c++) {
            const studentCell = studentNormalized[r] ? studentNormalized[r][c] : 0;
            const solutionCell = solutionNormalized[r] ? solutionNormalized[r][c] : 0;
            if (studentCell !== solutionCell) {
              viewCorrect = false;
              diffDetails = `The shape of your ${view} view has some missing or extra blocks.`;
              break;
            }
          }
          if (!viewCorrect) break;
        }
      }

      if (!viewCorrect) {
        allCorrect = false;
        incorrectViews.push(view);
        feedbackDetails.push(`${view.charAt(0).toUpperCase() + view.slice(1)} view: ${diffDetails}`);
      }
    });

    if (allCorrect) {
      setFeedback({ type: 'success', text: '🥳 Excellent work! Your 2D projections match the correct silhouettes perfectly, regardless of placement!' });

      if (isProgressionActive) {
        const nextIndex = currentProgressionIndex + 1;
        if (nextIndex < PROGRESSION_SEQUENCE.length) {
          setCurrentProgressionIndex(nextIndex);
          // Automatically generate the next shape in the progression
          generateNewShape(PROGRESSION_SEQUENCE[nextIndex].level);
        } else {
          // Progression completed!
          setIsProgressionActive(false);
          setCurrentProgressionIndex(-1);
          setShowCompletionBadge(true);
          setFeedback({ type: 'success', text: '🏆 Congratulations! You have successfully completed all challenges in the progression path!' });
          setCurrentShape(null); // Clear the shape to show the badge clearly
        }
      }
    } else {
      setFeedback({ type: 'error', text: `❌ Not quite! Your 2D projections don't fully match the correct silhouettes. ${feedbackDetails.join(' ')} Study the 3D model and its orthographic projections, then try again!` });
    }
  }, [currentShape, studentDrawings, isProgressionActive, currentProgressionIndex, generateNewShape]);

  const handleAskTutor = React.useCallback(async () => {
    if (!currentShape) {
      setFeedback({ type: 'error', text: 'No shape loaded. Generate one first!' });
      return;
    }

    setIsTutoring(true);
    setFeedback({ type: 'info', text: '💭 Asking the coach for a hint... This might take a moment.' });

    // Determine which views are incorrect to send specific context to Gemini
    const incorrectViews: ViewType[] = [];
    const viewsToCheck: ViewType[] = ['front', 'top', 'side'];
    viewsToCheck.forEach(view => {
      // Use the new position-agnostic comparison for determining incorrect views for the tutor.
      const { normalizedGrid: studentNormalized, dimensions: studentDims } = normalize2DGrid(studentDrawings[view]);
      const { normalizedGrid: solutionNormalized, dimensions: solutionDims } = normalize2DGrid(currentShape.views[view]);

      let viewCorrect = true;
      if (studentDims.width !== solutionDims.width || studentDims.height !== solutionDims.height) {
        viewCorrect = false;
      } else {
        for (let r = 0; r < solutionDims.height; r++) {
          for (let c = 0; c < solutionDims.width; c++) {
            const studentCell = studentNormalized[r] ? studentNormalized[r][c] : 0;
            const solutionCell = solutionNormalized[r] ? solutionNormalized[r][c] : 0;
            if (studentCell !== solutionCell) {
              viewCorrect = false;
              break;
            }
          }
          if (!viewCorrect) break;
        }
      }

      if (!viewCorrect) {
        incorrectViews.push(view);
      }
    });

    // Pass normalized drawings to the tutor if specific comparisons are needed there,
    // otherwise pass original drawings for more context if Gemini is smart enough to handle.
    // For now, passing original drawings and letting Gemini figure out the context of errors.
    const hint = await askTutor(currentShape.polyCube, studentDrawings, currentShape.views, incorrectViews);
    setFeedback(hint);
    setIsTutoring(false);
  }, [currentShape, studentDrawings]);

  const handleLevelChange = React.useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    setCurrentLevel(event.target.value as Level);
  }, []);

  // Removed handleCellHover callback
  // const handleCellHover = React.useCallback((
  //   row: number | null,
  //   col: number | null,
  //   viewType: ViewType,
  //   isHovering: boolean
  // ) => {
  //   if (!currentShape || !currentShape.polyCube) {
  //     setHighlightedBlocks([]);
  //     return;
  //   }

  //   if (isHovering && row !== null && col !== null) {
  //     // IMPORTANT: Highlighting is based on the *solution's* canonical projection,
  //     // not the student's potentially "floating" drawing. This helps to connect
  //     // the drawn 2D cell to its intended 3D component in the correct orientation.
  //     // The offsets are still needed here for `find3DBlocksFor2DCell` to map to the correct 3D blocks.
  //     const offsets = currentShape.views[`${viewType}Offsets`] || { x: 0, y: 0 };
  //     const dimensions = currentShape.dimensions;
  //     const blocksToHighlight = find3DBlocksFor2DCell(
  //       currentShape.polyCube,
  //       viewType,
  //       row,
  //       col,
  //       offsets,
  //       dimensions
  //     );
  //     setHighlightedBlocks(blocksToHighlight);
  //   } else {
  //     setHighlightedBlocks([]);
  //   }
  // }, [currentShape]);

  const startProgression = React.useCallback(() => {
    setIsProgressionActive(true);
    setCurrentProgressionIndex(0);
    setShowCompletionBadge(false);
    setFeedback(null);
    generateNewShape(PROGRESSION_SEQUENCE[0].level);
  }, [generateNewShape]);

  const resetProgression = React.useCallback(() => {
    setIsProgressionActive(false);
    setCurrentProgressionIndex(-1);
    setShowCompletionBadge(false);
    setFeedback(null);
    generateNewShape(currentLevel); // Go back to free play with the selected level
  }, [currentLevel, generateNewShape]);


  const feedbackClass = feedback
    ? {
      success: 'bg-green-100 text-green-700',
      error: 'bg-red-100 text-red-700',
      hint: 'bg-blue-100 text-blue-700',
      info: 'bg-yellow-100 text-yellow-700',
    }[feedback.type]
    : '';

  const currentProgressionStep = isProgressionActive && currentProgressionIndex !== -1
    ? PROGRESSION_SEQUENCE[currentProgressionIndex]
    : null;

  // Calculate the full height for the OrthographicGrid and IsometricView containers
  const fullCanvasPaddedHeight = VIEWPORT_SIZE + AXIS_LABEL_PADDING * 2;

  return (
    <div className="flex flex-col min-h-screen items-center p-4 bg-gray-100">
      <div className="bg-white rounded-xl shadow-lg p-6 md:p-10 w-full max-w-6xl mx-auto my-8">
        <h1 className="text-4xl font-extrabold text-gray-900 mb-4 text-center">
          📐 Technical Drawing Practice Coach
        </h1>
        {/* Removed subtitle: <p className="text-xl text-gray-600 mb-8 text-center">
          Practice visualizing 3D shapes and drawing their 2D technical views!
        </p> */}

        <section className="mb-8">
          {/* Removed 'Your Challenge' line: <h2 className="text-2xl font-bold text-gray-800 mb-4 text-center">Your Challenge: Draw the 2D Views!</h2> */}
          <p className="text-gray-700 leading-relaxed">
            Your goal is to draw the <span className="font-bold">Front</span>, <span className="font-bold">Top</span>, and <span className="font-bold">Right Side</span> views of the 3D shape shown below.
            Click on the squares in the 2D grids to fill them in or erase them.
            Use the colors on the 3D model (<span className="font-bold text-red-500">Red</span> for Front, <span className="font-bold text-yellow-500">Yellow</span> for Top, <span className="font-bold text-blue-500">Blue</span> for Right Side) as your guide.
            You can drag the <span className="font-bold">3D model</span> to see it from different angles.
          </p>
        </section>

        <hr className="my-8 border-t-2 border-gray-200" />

        {showCompletionBadge ? (
          <div className="completion-badge p-8 bg-gradient-to-r from-green-400 to-blue-500 text-white rounded-lg shadow-xl text-center mb-8 mx-auto max-w-xl">
            <h2 className="text-5xl font-extrabold mb-4 animate-bounce">🚀 Mission Accomplished! 🚀</h2>
            <p className="text-2xl font-semibold mb-6">You've mastered the art of Orthographic Projection!</p>
            <p className="text-xl">You completed all {PROGRESSION_SEQUENCE.length} challenges.</p>
            <button
              onClick={resetProgression}
              className="mt-6 bg-white text-gray-800 font-bold py-3 px-8 rounded-full shadow-lg hover:bg-gray-200 transition duration-300 ease-in-out text-lg"
            >
              Start New Progression
            </button>
          </div>
        ) : (
          <section className={`mb-8 p-4 rounded-lg shadow-inner w-full ${
            isProgressionActive
              ? 'bg-indigo-50 border-4 border-indigo-500 shadow-xl' // Challenge mode styling
              : 'bg-blue-50 border border-gray-200' // Default free play styling
          }`}>
            {currentProgressionStep && (
              <p className="text-lg font-bold text-blue-700 text-center mb-4">
                Challenge: {currentProgressionStep.description}
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 items-start justify-items-center max-w-5xl mx-auto">
              {/* Side View - Top Left */}
              <OrthographicGrid
                viewType="side"
                gridState={studentDrawings.side}
                onCellToggle={handleCellToggle}
                solutionState={currentShape ? currentShape.views.side : null}
                label="Side View (Blue)"
                // Removed onCellHover={handleCellHover}
              />

              {/* Front View - Top Right */}
              <OrthographicGrid
                viewType="front"
                gridState={studentDrawings.front}
                onCellToggle={handleCellToggle}
                solutionState={currentShape ? currentShape.views.front : null}
                label="Front View (Red)"
                // Removed onCellHover={handleCellHover}
              />

              {/* Top View - Bottom Left */}
              <OrthographicGrid
                viewType="top"
                gridState={studentDrawings.top}
                onCellToggle={handleCellToggle}
                solutionState={currentShape ? currentShape.views.top : null}
                label="Top View (Yellow)"
                // Removed onCellHover={handleCellHover}
              />

              {/* Isometric View - Bottom Right */}
              <div className={`w-full h-full flex flex-col items-center min-h-[${fullCanvasPaddedHeight}px]`}>
                <IsometricView 
                  polyCube={currentShape ? currentShape.polyCube : null} 
                  // Removed highlightedBlocks={highlightedBlocks} 
                />
              </div>
            </div>
          </section>
        )}


        <div className="flex flex-wrap justify-center gap-4 mt-8 pb-4 sticky bottom-0 bg-white p-4 rounded-b-xl shadow-lg">
          {/* Difficulty Selection */}
          <div className="flex flex-col items-start min-w-[150px]">
            <select
              id="level-select"
              className="block w-full text-lg font-bold py-3 px-6 rounded-md shadow-md
                         bg-gray-700 text-white
                         border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                         appearance-none pr-10 cursor-pointer" // Add appearance-none for custom arrow control if needed, pr-10 for internal spacing
              value={currentLevel}
              onChange={handleLevelChange}
              disabled={isLoading || isTutoring || isProgressionActive} // Disable if progression is active
            >
              <option value="" disabled>Difficulty</option> {/* Placeholder */}
              {Object.values(Level).map(level => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>
          </div>

          {!isProgressionActive && !showCompletionBadge && (
            <button
              onClick={startProgression}
              className="flex items-center space-x-2 bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-3 px-6 rounded-md shadow-md transition duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50 text-lg"
              disabled={isLoading || isTutoring}
            >
              <span>Challenge Mode</span> {/* Updated text */}
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </button>
          )}

          {(isProgressionActive || showCompletionBadge) && (
            <button
              onClick={resetProgression}
              className="flex items-center space-x-2 bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-6 rounded-md shadow-md transition duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-opacity-50 text-lg"
              disabled={isLoading || isTutoring}
            >
              <span>Reset Progression</span>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356-2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2.128M11 9v4m-3-1h6" />
              </svg>
            </button>
          )}

          {/* New Example Button (only visible in free play) */}
          {!isProgressionActive && !showCompletionBadge && (
            <button
              onClick={() => generateNewShape()} // Call without specific level for free play
              className="flex items-center space-x-2 bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-6 rounded-md shadow-md transition duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 text-lg"
              disabled={isLoading || isTutoring}
            >
              <span>New Example</span>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356-2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2.128M11 9v4m-3-1h6" />
              </svg>
            </button>
          )}


          {/* Ask Coach for Hint Button */}
          <button
            onClick={handleAskTutor}
            className={`flex items-center space-x-2 bg-purple-500 hover:bg-purple-600 text-white font-bold py-3 px-6 rounded-md shadow-md transition duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50 text-lg`}
            disabled={isLoading || isTutoring || showCompletionBadge}
          >
            <span>Ask Coach for Hint</span>
            {isTutoring ? (
              <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9.247a3.75 3.75 0 100-7.494 3.75 3.75 0 000 7.494zM10.75 10.5V14a3.75 3.75 0 00-7.5 0v-3.5L3 10a8.25 8.25 0 017.75-8.25h1.5a8.25 8.25 0 017.75 8.25h-1.25zM17.25 10.5V14a3.75 3.75 0 00-7.5 0v-3.5L10 10a8.25 8.25 0 017.75-8.25h1.5a8.25 8.25 0 017.75 8.25h-1.25z" />
              </svg>
            )}
          </button>

          {/* Check My Drawing! Button */}
          <button
            onClick={validateDrawing}
            className="flex items-center space-x-2 bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-md shadow-md transition duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50 text-lg"
            disabled={isLoading || isTutoring || showCompletionBadge}
          >
            <span>Check My Drawing!</span>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </button>
        </div>

        {feedback && (
          <p
            className={`text-lg font-semibold p-4 rounded-md mt-4 text-center mx-auto max-w-2xl ${feedbackClass}`}
            dangerouslySetInnerHTML={{ __html: feedback.text }}
          ></p>
        )}
      </div>
    </div>
  );
};

export default App;