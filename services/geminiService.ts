
import { GoogleGenAI } from '@google/genai';
import { PolyCube, OrthographicViews, FeedbackMessage, ViewType, OrthographicGridState } from '../types';
import { GRID_SIZE } from '../constants';

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

/**
 * Compares two 2D grids position-agnostically and returns a string describing the differences.
 * @param studentGrid The student's drawing.
 * @param correctGrid The correct solution.
 * @returns A string detailing missing or extra cells, considering only the shape.
 */
function compareGridsForHint(
  studentGrid: OrthographicGridState,
  correctGrid: OrthographicGridState
): string {
  const { normalizedGrid: studentNormalized, dimensions: studentDims } = normalize2DGrid(studentGrid);
  const { normalizedGrid: correctNormalized, dimensions: correctDims } = normalize2DGrid(correctGrid);

  let feedback = '';

  if (studentDims.width !== correctDims.width || studentDims.height !== correctDims.height) {
    feedback += `The overall outline (width or height) of your drawing doesn't match the expected shape.`;
  } else {
    let missingCells = 0;
    let extraCells = 0;

    for (let r = 0; r < correctDims.height; r++) {
      for (let c = 0; c < correctDims.width; c++) {
        const studentCell = studentNormalized[r] ? studentNormalized[r][c] : 0;
        const correctCell = correctNormalized[r] ? correctNormalized[r][c] : 0;

        if (correctCell === 1 && studentCell === 0) {
          missingCells++;
        } else if (correctCell === 0 && studentCell === 1) {
          extraCells++;
        }
      }
    }

    if (missingCells > 0) {
      feedback += `You seem to be missing some blocks in the shape.`;
    }
    if (extraCells > 0) {
      if (feedback) feedback += ' Also, ';
      feedback += `You've added extra blocks that shouldn't be part of the shape.`;
    }
  }
  return feedback.trim();
}


/**
 * Sends the current drawing state to the Gemini API to get a contextual hint.
 * @param polyCube The 3D structure of the object.
 * @param studentDrawings The student's current orthographic drawings.
 * @param correctViews The correct orthographic projections.
 * @param incorrectViews List of views that are currently incorrect (position-agnostically).
 * @returns A promise that resolves to a FeedbackMessage with the hint.
 */
export async function askTutor(
  polyCube: PolyCube,
  studentDrawings: OrthographicViews,
  correctViews: OrthographicViews,
  incorrectViews: ViewType[]
): Promise<FeedbackMessage> {
  // Create a new GoogleGenAI instance right before making an API call
  // to ensure it always uses the most up-to-date API key from the environment.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-2.5-flash'; // Switched to gemini-2.5-flash for free-tier compatibility

  const promptParts: string[] = [];

  promptParts.push(`The student is trying to draw the orthographic projections of a 3D shape.
The task is to convert the 3D isometric view into 2D orthographic drawings (Front, Top, Right Side).
The student needs to visualize all parts of the shape that contribute to the silhouette of each view.
The 2D drawings are evaluated based on their *shape* (silhouette), not their absolute position on the grid.

Here is the 3D shape represented as a ${GRID_SIZE}x${GRID_SIZE}x${GRID_SIZE} 3D array (1 means block is present, 0 means empty):
${JSON.stringify(polyCube)}`);

  if (incorrectViews.length > 0) {
    promptParts.push(`
The student has made errors in the *shape* (silhouette) of the following views: ${incorrectViews.map(v => v.charAt(0).toUpperCase() + v.slice(1)).join(', ')}.

Here are the student's current drawings (1 means cell is filled, 0 means empty) for context, even though their position doesn't determine correctness:
Front View: ${JSON.stringify(studentDrawings.front)}
Top View: ${JSON.stringify(studentDrawings.top)}
Side View: ${JSON.stringify(studentDrawings.side)}

Here are the correct solutions (1 means cell is filled, 0 means empty) for comparison:
Front View (Solution): ${JSON.stringify(correctViews.front)}
Top View (Solution): ${JSON.stringify(correctViews.top)}
Side View (Solution): ${JSON.stringify(correctViews.side)}

For each incorrect view, analyze the student's drawing against the solution's shape and provide a single, encouraging, and *contextual* hint.
Focus on guiding their spatial reasoning for the views that have errors, emphasizing aspects of the *shape* or *silhouette* that might be incorrect (e.g., overall width, height, or missing/extra internal sections). Do not directly give the exact answer (like specific coordinates).
For example, if the Front view is incorrect, you might say: "Consider the overall height and width of the object from the front. Are there any hidden blocks that should still appear in the silhouette?".
Try to generalize the feedback based on common projection errors rather than individual cell discrepancies.
The hint should be concise and no more than 2-3 sentences. If the current drawings are very far off, suggest a broader strategy.
`);
  } else {
    // This case should ideally not happen if askTutor is only called when there are errors,
    // but as a fallback, provide general encouragement.
    promptParts.push(`
All views are currently correct. Please provide a brief, encouraging message.
`);
  }

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: [{ text: promptParts.join('\n\n') }],
      config: {
        temperature: 0.7,
        topP: 0.95,
        topK: 64,
        systemInstruction: `You are an expert technical drawing coach for 8th-grade students learning orthographic projection. Your goal is to provide a single, encouraging, and *contextual* hint without giving away the direct answer. Focus on guiding the student's spatial reasoning for the shape/silhouette.`,
      },
    });

    const hintText = response.text;
    if (hintText) {
      return { type: 'hint', text: hintText };
    } else {
      return { type: 'error', text: 'The coach could not generate a hint. Please try again.' };
    }
  } catch (error) {
    console.error('Gemini API Error:', error);
    // Simplified error message as explicit API key selection for billing is no longer required for this model.
    return { type: 'error', text: 'Failed to get a hint from the coach. Check your API key and try again later.' };
  }
}
