// Sudoku Engine — puzzle generation, validation, unique-solution guarantee
class SudokuEngine {

  // Generate a complete valid 9×9 solution grid
  generateSolution() {
    const grid = Array(9).fill(null).map(() => Array(9).fill(0));
    this.fillGrid(grid);
    return grid;
  }

  // Backtracking filler — shuffles candidates for randomised boards
  fillGrid(grid, row = 0, col = 0) {
    if (row === 9) return true;
    if (col === 9) return this.fillGrid(grid, row + 1, 0);
    const nums = this.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (const num of nums) {
      if (this.isValid(grid, row, col, num)) {
        grid[row][col] = num;
        if (this.fillGrid(grid, row, col + 1)) return true;
        grid[row][col] = 0;
      }
    }
    return false;
  }

  // Check if placing num at (row,col) is valid against current grid
  isValid(grid, row, col, num) {
    for (let i = 0; i < 9; i++) {
      if (grid[row][i] === num || grid[i][col] === num) return false;
    }
    const br = Math.floor(row / 3) * 3, bc = Math.floor(col / 3) * 3;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        if (grid[br + i][bc + j] === num) return false;
      }
    }
    return true;
  }

  // Count solutions (stops early at limit) — used to verify uniqueness
  countSolutions(grid, limit = 2) {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (grid[r][c] === 0) {
          let count = 0;
          for (let num = 1; num <= 9; num++) {
            if (this.isValid(grid, r, c, num)) {
              grid[r][c] = num;
              count += this.countSolutions(grid, limit - count);
              grid[r][c] = 0;
              if (count >= limit) return count;
            }
          }
          return count;
        }
      }
    }
    return 1; // fully filled = one solution found
  }

  // Has exactly one solution?
  hasUniqueSolution(grid) {
    const copy = grid.map(r => [...r]);
    return this.countSolutions(copy, 2) === 1;
  }

  // Generate a puzzle for a given difficulty level
  // Removes cells one-by-one, checking uniqueness after each removal
  generatePuzzle(level) {
    const targetRemove = { basic: 25, simple: 30, easy: 35, medium: 45, hard: 55, crazy: 60 };
    const target = targetRemove[level] || 35;

    const solution = this.generateSolution();
    const grid = solution.map(r => [...r]);

    const positions = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) positions.push([r, c]);
    }
    this.shuffle(positions);

    let removed = 0;
    for (const [r, c] of positions) {
      if (removed >= target) break;
      const backup = grid[r][c];
      grid[r][c] = 0;
      if (this.hasUniqueSolution(grid)) {
        removed++;
      } else {
        grid[r][c] = backup;
      }
    }

    // Build given mask
    const given = Array(9).fill(null).map(() => Array(9).fill(false));
    for (let i = 0; i < 9; i++) {
      for (let j = 0; j < 9; j++) {
        if (grid[i][j] !== 0) given[i][j] = true;
      }
    }

    return { grid, solution, given };
  }

  // Validate a completed grid
  isValidCompleteSolution(grid) {
    for (let i = 0; i < 9; i++) {
      const row = new Set(), col = new Set();
      for (let j = 0; j < 9; j++) {
        if (grid[i][j] < 1 || grid[i][j] > 9 || row.has(grid[i][j])) return false;
        row.add(grid[i][j]);
        if (grid[j][i] < 1 || grid[j][i] > 9 || col.has(grid[j][i])) return false;
        col.add(grid[j][i]);
      }
    }
    for (let br = 0; br < 3; br++) {
      for (let bc = 0; bc < 3; bc++) {
        const box = new Set();
        for (let i = 0; i < 3; i++) {
          for (let j = 0; j < 3; j++) {
            const v = grid[br * 3 + i][bc * 3 + j];
            if (box.has(v)) return false;
            box.add(v);
          }
        }
      }
    }
    return true;
  }

  // Check if number can be placed (box-only check for fast-fill)
  canPlaceNumber(grid, row, col, num) {
    const br = Math.floor(row / 3) * 3, bc = Math.floor(col / 3) * 3;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        if (grid[br + i][bc + j] === num) return false;
      }
    }
    return true;
  }

  // Fisher-Yates shuffle
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}
