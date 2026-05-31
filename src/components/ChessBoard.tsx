/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Board, Position, Color, PieceType } from '../types';

interface ChessBoardProps {
  board: Board;
  turn: Color;
  selectedSquare: Position | null;
  legalMoves: Position[];
  onSquareClick: (r: number, c: number) => void;
  isFlipped: boolean;
  lastMove: { from: Position; to: Position } | null;
  kingInCheckPos: Position | null;
}

// Visual mapping for Chess characters
const PIECE_IMAGES: Record<PieceType, { w: string; b: string }> = {
  p: { w: '♙', b: '♟' },
  r: { w: '♖', b: '♜' },
  n: { w: '♘', b: '♞' },
  b: { w: '♗', b: '♝' },
  q: { w: '♕', b: '♛' },
  k: { w: '♔', b: '♚' }
};

export default function ChessBoard({
  board,
  turn,
  selectedSquare,
  legalMoves,
  onSquareClick,
  isFlipped,
  lastMove,
  kingInCheckPos
}: ChessBoardProps) {
  // Logical chess indexes
  const rows = isFlipped ? Array.from({ length: 8 }, (_, i) => i) : Array.from({ length: 8 }, (_, i) => 7 - i).reverse();
  const cols = isFlipped ? Array.from({ length: 8 }, (_, i) => 7 - i) : Array.from({ length: 8 }, (_, i) => i);

  // Check if position is highlighted as a legal destination
  const isLegalDestination = (r: number, c: number): boolean => {
    return legalMoves.some((m) => m.r === r && m.c === c);
  };

  // Check if last move highlighted
  const isLastMoveSquare = (r: number, c: number): boolean => {
    if (!lastMove) return false;
    return (
      (lastMove.from.r === r && lastMove.from.c === c) ||
      (lastMove.to.r === r && lastMove.to.c === c)
    );
  };

  // Convert row and col to algebraic letter coordinate (e.g. 7, 0 -> a1)
  const getFileChar = (c: number): string => String.fromCharCode(97 + c);
  const getRankNum = (r: number): number => 8 - r;

  return (
    <div className="w-full max-w-xl aspect-square bg-slate-950 p-2 md:p-3 rounded-2xl border-4 border-slate-850 shadow-2xl overflow-hidden relative select-none">
      <div className="grid grid-cols-8 grid-rows-8 w-full h-full gap-0 bg-slate-900 rounded-lg overflow-hidden">
        {rows.map((r) => {
          return cols.map((c) => {
            const piece = board[r][c];
            const isDark = (r + c) % 2 === 1;
            const isSelected = selectedSquare && selectedSquare.r === r && selectedSquare.c === c;
            const isLegal = isLegalDestination(r, c);
            const isKingInCheck = kingInCheckPos && kingInCheckPos.r === r && kingInCheckPos.c === c;
            const isLast = isLastMoveSquare(r, c);

            // Determine overlay colors
            let squareBg = isDark ? 'bg-[#94A3B8]' : 'bg-[#E2E8F0]';

            if (isLast) {
              squareBg += ' ring-4 ring-inset ring-amber-400/40 bg-amber-400/10';
            }
            if (isSelected) {
              squareBg += ' ring-4 ring-inset ring-emerald-400/60 bg-emerald-500/10';
            }
            if (isKingInCheck) {
              squareBg = 'bg-rose-500/90 text-white animate-pulse';
            }

            return (
              <div
                key={`${r}-${c}`}
                id={`square-${r}-${c}`}
                onClick={() => onSquareClick(r, c)}
                className={`w-full h-full relative flex items-center justify-center cursor-pointer select-none transition-colors duration-150 ${squareBg}`}
              >
                {/* Chess symbols */}
                {piece && (
                  <span
                    className={`text-3xl sm:text-4xl md:text-5xl font-semibold select-none transform hover:scale-110 active:scale-95 transition-all duration-200 z-10 flex items-center justify-center filter ${
                      piece.color === 'w'
                        ? 'text-white scale-100 hover:scale-110'
                        : 'text-slate-900 scale-100 hover:scale-110'
                    }`}
                    style={{
                      textShadow: piece.color === 'w' 
                        ? '0 2px 4px rgba(0,0,0,0.5), 0 0 1px rgba(0,0,0,0.8)' 
                        : '0 1px 2px rgba(255,255,255,0.6)'
                    }}
                  >
                    {PIECE_IMAGES[piece.type][piece.color]}
                  </span>
                )}

                {/* Highlight Legal Move overlay */}
                {isLegal && (
                  <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                    {piece ? (
                      // If target has an enemy piece, draw a capture border/ring
                      <div className="w-4/5 h-4/5 rounded-full border-4 border-emerald-500/80 bg-transparent animate-pulse" />
                    ) : (
                      // If target is empty, draw a solid small legal move dot
                      <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-emerald-500/70 shadow-sm" />
                    )}
                  </div>
                )}

                {/* Draw algebraic grid labels inside corners (Lichess style) */}
                {/* Draw column letters (Files) along bottom edge of board cells */}
                {((!isFlipped && r === 7) || (isFlipped && r === 0)) && (
                  <span
                    className={`absolute bottom-0.5 right-1.5 text-[9px] md:text-[10px] font-mono font-bold tracking-wider opacity-60 pointer-events-none select-none ${
                      isDark ? 'text-slate-100' : 'text-slate-800'
                    }`}
                  >
                    {getFileChar(c)}
                  </span>
                )}

                {/* Draw row numbers (Ranks) along left/right edge of board cells */}
                {((!isFlipped && c === 0) || (isFlipped && c === 7)) && (
                  <span
                    className={`absolute top-0.5 left-1 text-[9px] md:text-[10px] font-mono font-bold opacity-60 pointer-events-none select-none ${
                      isDark ? 'text-slate-100' : 'text-slate-800'
                    }`}
                  >
                    {getRankNum(r)}
                  </span>
                )}
              </div>
            );
          });
        })}
      </div>
    </div>
  );
}
