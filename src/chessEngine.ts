/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Piece, PieceType, Color, Board, Position, ChessGame, CastlingRights, MoveRecord } from './types';

// Generate a nice random string for piece IDs
function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

export function createInitialBoard(): Board {
  const board: Board = Array(8).fill(null).map(() => Array(8).fill(null));

  const backRow: PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];

  // Set up black back row
  for (let c = 0; c < 8; c++) {
    board[0][c] = { id: `b-${backRow[c]}-${c}`, type: backRow[c], color: 'b', hasMoved: false };
  }
  // Set up black pawns
  for (let c = 0; c < 8; c++) {
    board[1][c] = { id: `b-p-${c}`, type: 'p', color: 'b', hasMoved: false };
  }

  // Set up white pawns
  for (let c = 0; c < 8; c++) {
    board[6][c] = { id: `w-p-${c}`, type: 'p', color: 'w', hasMoved: false };
  }
  // Set up white back row
  for (let c = 0; c < 8; c++) {
    board[7][c] = { id: `w-${backRow[c]}-${c}`, type: backRow[c], color: 'w', hasMoved: false };
  }

  return board;
}

export function createNewGame(id: string = generateId()): ChessGame {
  return {
    id,
    board: createInitialBoard(),
    turn: 'w',
    castlingRights: {
      w: { kingSide: true, queenSide: true },
      b: { kingSide: true, queenSide: true }
    },
    enPassantTarget: null,
    capturedPieces: { w: [], b: [] },
    history: [],
    status: 'active',
    winner: null
  };
}

export function cloneBoard(board: Board): Board {
  return board.map(row => row.map(cell => cell ? { ...cell } : null));
}

export function cloneGame(game: ChessGame): ChessGame {
  return {
    id: game.id,
    board: cloneBoard(game.board),
    turn: game.turn,
    castlingRights: {
      w: { ...game.castlingRights.w },
      b: { ...game.castlingRights.b }
    },
    enPassantTarget: game.enPassantTarget ? { ...game.enPassantTarget } : null,
    capturedPieces: {
      w: [...game.capturedPieces.w],
      b: [...game.capturedPieces.b]
    },
    history: game.history.map(move => ({
      from: { ...move.from },
      to: { ...move.to },
      piece: { ...move.piece },
      captured: move.captured ? { ...move.captured } : null,
      notation: move.notation,
      isCastling: move.isCastling,
      isEnPassant: move.isEnPassant,
      promotion: move.promotion
    })),
    status: game.status,
    winner: game.winner
  };
}

// Convert board coordinates to standard chess algebraic notation, e.g., (7,0) -> "a1"
export function coordsToNotation(r: number, c: number): string {
  const file = String.fromCharCode(97 + c); // 'a' starts at 97
  const rank = 8 - r;
  return `${file}${rank}`;
}

// Check coordinates bounds
function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

// Get raw candidate pseudo-legal moves for a piece (ignoring check protection)
export function getPseudoLegalMoves(
  board: Board,
  r: number,
  c: number,
  castlingRights?: { w: CastlingRights; b: CastlingRights },
  enPassantTarget?: Position | null
): Position[] {
  const piece = board[r][c];
  if (!piece) return [];

  const moves: Position[] = [];
  const color = piece.color;
  const oppColor = color === 'w' ? 'b' : 'w';

  switch (piece.type) {
    case 'p': {
      const dir = color === 'w' ? -1 : 1;
      const startRow = color === 'w' ? 6 : 1;

      // 1 square forward
      const f1 = r + dir;
      if (inBounds(f1, c) && !board[f1][c]) {
        moves.push({ r: f1, c });

        // 2 squares forward from starting row
        const f2 = r + 2 * dir;
        if (r === startRow && inBounds(f2, c) && !board[f2][c]) {
          moves.push({ r: f2, c });
        }
      }

      // Standard captures
      const diagCols = [c - 1, c + 1];
      for (const dc of diagCols) {
        if (inBounds(r + dir, dc)) {
          const target = board[r + dir][dc];
          if (target && target.color === oppColor) {
            moves.push({ r: r + dir, c: dc });
          }
        }
      }

      // En Passant
      if (enPassantTarget && enPassantTarget.r === r + dir && Math.abs(enPassantTarget.c - c) === 1) {
        moves.push({ r: enPassantTarget.r, c: enPassantTarget.c });
      }
      break;
    }

    case 'n': {
      const knightOffsets = [
        [-2, -1], [-2, 1], [-1, -2], [-1, 2],
        [1, -2], [1, 2], [2, -1], [2, 1]
      ];
      for (const [dr, dc] of knightOffsets) {
        const nr = r + dr;
        const nc = c + dc;
        if (inBounds(nr, nc)) {
          const cell = board[nr][nc];
          if (!cell || cell.color === oppColor) {
            moves.push({ r: nr, c: nc });
          }
        }
      }
      break;
    }

    case 'b':
    case 'r':
    case 'q': {
      const directions: [number, number][] = [];
      if (piece.type === 'b' || piece.type === 'q') {
        directions.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
      }
      if (piece.type === 'r' || piece.type === 'q') {
        directions.push([-1, 0], [1, 0], [0, -1], [0, 1]);
      }

      for (const [dr, dc] of directions) {
        let nr = r + dr;
        let nc = c + dc;
        while (inBounds(nr, nc)) {
          const cell = board[nr][nc];
          if (!cell) {
            moves.push({ r: nr, c: nc });
          } else {
            if (cell.color === oppColor) {
              moves.push({ r: nr, c: nc });
            }
            break; // Blocked by piece
          }
          nr += dr;
          nc += dc;
        }
      }
      break;
    }

    case 'k': {
      const kingOffsets = [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1],           [0, 1],
        [1, -1],  [1, 0],  [1, 1]
      ];
      for (const [dr, dc] of kingOffsets) {
        const nr = r + dr;
        const nc = c + dc;
        if (inBounds(nr, nc)) {
          const cell = board[nr][nc];
          if (!cell || cell.color === oppColor) {
            moves.push({ r: nr, c: nc });
          }
        }
      }

      // Castling pseudo-moves: actual safety checks (such as squares not attacked)
      // are done in legal moves calculation to prevent infinite loops.
      if (castlingRights) {
        const rights = castlingRights[color];
        const row = color === 'w' ? 7 : 0;
        if (r === row && c === 4) {
          // King side castle
          if (rights.kingSide && !board[row][5] && !board[row][6]) {
            const kingRook = board[row][7];
            if (kingRook && kingRook.type === 'r' && kingRook.color === color) {
              moves.push({ r: row, c: 6 });
            }
          }
          // Queen side castle
          if (rights.queenSide && !board[row][1] && !board[row][2] && !board[row][3]) {
            const queenRook = board[row][0];
            if (queenRook && queenRook.type === 'r' && queenRook.color === color) {
              moves.push({ r: row, c: 2 });
            }
          }
        }
      }
      break;
    }
  }

  return moves;
}

// Find king coordinate
export function findKing(board: Board, color: Color): Position | null {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = board[r][c];
      if (cell && cell.type === 'k' && cell.color === color) {
        return { r, c };
      }
    }
  }
  return null;
}

// Is coordinate square currently attacked by color?
export function isSquareAttacked(board: Board, r: number, c: number, attackerColor: Color): boolean {
  for (let ar = 0; ar < 8; ar++) {
    for (let ac = 0; ac < 8; ac++) {
      const cell = board[ar][ac];
      if (cell && cell.color === attackerColor) {
        // Find pseudo-legal moves for that piece. Skip castling rights when calling to avoid mutual recursion.
        const moves = getPseudoLegalMoves(board, ar, ac);
        if (moves.some(m => m.r === r && m.c === c)) {
          return true;
        }
      }
    }
  }
  return false;
}

export function isKingInCheck(board: Board, color: Color): boolean {
  const kingPos = findKing(board, color);
  if (!kingPos) return false;
  const oppColor = color === 'w' ? 'b' : 'w';
  return isSquareAttacked(board, kingPos.r, kingPos.c, oppColor);
}

// Returns absolute legal moves (where making the move resolves any checks and does not put the king in danger)
export function getLegalMoves(game: ChessGame, r: number, c: number): Position[] {
  const piece = game.board[r][c];
  if (!piece || piece.color !== game.turn) return [];

  const pseudoMoves = getPseudoLegalMoves(game.board, r, c, game.castlingRights, game.enPassantTarget);
  const legalMoves: Position[] = [];

  const color = piece.color;
  const oppColor = color === 'w' ? 'b' : 'w';

  for (const move of pseudoMoves) {
    // Check castling rules specifically. Castling is illegal if:
    // 1. King is currently in check
    // 2. King passes through a square that is attacked
    // 3. King lands on a square that is attacked
    if (piece.type === 'k' && Math.abs(move.c - c) === 2) {
      if (isKingInCheck(game.board, color)) continue;

      const isKingSide = move.c === 6;
      const passCol = isKingSide ? 5 : 3;

      if (isSquareAttacked(game.board, r, passCol, oppColor)) continue;
      if (isSquareAttacked(game.board, r, move.c, oppColor)) continue;
    }

    // Simulate the move on a temp board
    const tempBoard = cloneBoard(game.board);
    const tempPiece = tempBoard[r][c];

    // Standard piece move simulation
    tempBoard[r][c] = null;

    if (piece.type === 'p' && game.enPassantTarget && move.r === game.enPassantTarget.r && move.c === game.enPassantTarget.c) {
      // En Passant capture simulation: capture the enemy pawn
      const captureRow = color === 'w' ? move.r + 1 : move.r - 1;
      tempBoard[captureRow][move.c] = null;
    }

    tempBoard[move.r][move.c] = tempPiece;

    // Check if king is in check after the simulated move
    if (!isKingInCheck(tempBoard, color)) {
      legalMoves.push(move);
    }
  }

  return legalMoves;
}

// Checks if player of color has any legal moves available at all
export function hasAnyLegalMoves(game: ChessGame, color: Color): boolean {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = game.board[r][c];
      if (cell && cell.color === color) {
        const moves = getLegalMoves(game, r, c);
        if (moves.length > 0) return true;
      }
    }
  }
  return false;
}

// Executes a move on the game state. Returns the updated state.
export function executeMove(
  game: ChessGame,
  from: Position,
  to: Position,
  promotionType: PieceType = 'q'
): ChessGame {
  const next = cloneGame(game);
  const piece = next.board[from.r][from.c];
  if (!piece) return next;

  const color = piece.color;
  const oppColor = color === 'w' ? 'b' : 'w';

  let captured: Piece | null = next.board[to.r][to.c];
  let isCastling = false;
  let isEnPassant = false;

  // 1. Double step pawn sets up next enPassantTarget
  let nextEnPassantTarget: Position | null = null;
  if (piece.type === 'p' && Math.abs(to.r - from.r) === 2) {
    const rBehindState = color === 'w' ? from.r - 1 : from.r + 1;
    nextEnPassantTarget = { r: rBehindState, c: from.c };
  }

  // 2. En Passant execution
  if (piece.type === 'p' && next.enPassantTarget && to.r === next.enPassantTarget.r && to.c === next.enPassantTarget.c) {
    const oppPawnRow = color === 'w' ? to.r + 1 : to.r - 1;
    captured = next.board[oppPawnRow][to.c];
    next.board[oppPawnRow][to.c] = null;
    isEnPassant = true;
  }

  // 3. Castle execution
  if (piece.type === 'k' && Math.abs(to.c - from.c) === 2) {
    isCastling = true;
    const isKingSide = to.c === 6;
    const rRow = color === 'w' ? 7 : 0;
    const fRcol = isKingSide ? 7 : 0;
    const tRcol = isKingSide ? 5 : 3;

    const rook = next.board[rRow][fRcol];
    if (rook) {
      rook.hasMoved = true;
      next.board[rRow][tRcol] = rook;
      next.board[rRow][fRcol] = null;
    }
  }

  // Record captured pieces (to display beautifully grouped beside active board)
  if (captured) {
    if (captured.color === 'w') {
      next.capturedPieces.w.push(captured.type);
    } else {
      next.capturedPieces.b.push(captured.type);
    }
  }

  // Move the piece
  const movedPiece = { ...piece, hasMoved: true };
  next.board[from.r][from.c] = null;

  // Handle pawn promotion
  let finalPiece = movedPiece;
  if (piece.type === 'p' && (to.r === 0 || to.r === 7)) {
    finalPiece = {
      id: `${piece.id}-promoted-${generateId()}`,
      type: promotionType,
      color: color,
      hasMoved: true
    };
  }

  next.board[to.r][to.c] = finalPiece;

  // 4. Update Castling Rights
  // If King moves, lose both
  if (piece.type === 'k') {
    next.castlingRights[color] = { kingSide: false, queenSide: false };
  }
  // If Rook moves or is captured, lose corresponding rights
  if (piece.type === 'r') {
    if (from.r === (color === 'w' ? 7 : 0)) {
      if (from.c === 0) next.castlingRights[color].queenSide = false;
      if (from.c === 7) next.castlingRights[color].kingSide = false;
    }
  }
  // If a Rook is captured at its starting square, opponent loses rights
  if (captured && captured.type === 'r') {
    const crRow = oppColor === 'w' ? 7 : 0;
    if (to.r === crRow) {
      if (to.c === 0) next.castlingRights[oppColor].queenSide = false;
      if (to.c === 7) next.castlingRights[oppColor].kingSide = false;
    }
  }

  // Set next turn en passant target
  next.enPassantTarget = nextEnPassantTarget;

  // 5. Generate move notation (e.g., Nf3, O-O, exd6, e8=Q)
  let notation = '';
  if (isCastling) {
    notation = to.c === 6 ? 'O-O' : 'O-O-O';
  } else {
    const pTypePrefix = piece.type === 'p' ? '' : piece.type.toUpperCase();
    const captureSign = captured ? 'x' : '';
    const fileDepart = piece.type === 'p' && captured ? String.fromCharCode(97 + from.c) : '';
    const destSquare = coordsToNotation(to.r, to.c);
    const promSuffix = finalPiece.type !== piece.type ? `=${finalPiece.type.toUpperCase()}` : '';

    notation = `${fileDepart}${pTypePrefix}${captureSign}${destSquare}${promSuffix}`;
  }

  // 6. Check state of the opponent's king after my move
  const oppInCheck = isKingInCheck(next.board, oppColor);
  if (oppInCheck) {
    notation += '+';
  }

  // Switch turns
  next.turn = oppColor;

  // Check game statuses
  const oppHasMoves = hasAnyLegalMoves(next, oppColor);

  if (!oppHasMoves) {
    if (oppInCheck) {
      // Checkmate!
      next.status = 'checkmate';
      next.winner = color;
      // Change notation '+' to '#' to designate checkmate
      notation = notation.replace(/\+$/, '#');
    } else {
      // Stalemate
      next.status = 'stalemate';
      next.winner = 'draw';
    }
  } else {
    // Insufficient material check or other draws could go here, but checkmate/stalemate is the standard logic.
  }

  // Save to history
  const record: MoveRecord = {
    from,
    to,
    piece: { ...piece },
    captured: captured ? { ...captured } : null,
    notation,
    isCastling,
    isEnPassant,
    promotion: finalPiece.type !== piece.type ? finalPiece.type : undefined
  };
  next.history.push(record);

  return next;
}
