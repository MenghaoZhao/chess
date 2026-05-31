/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { PieceType, Color } from '../types';

interface CapturedPiecesProps {
  captured: PieceType[];
  color: Color; // The color of the pieces that were CAPTURED (e.g., if color === 'w', these are captured White pieces displayed on Black's side)
}

// Map piece types to clean visual symbols
const PieceSymbols: Record<PieceType, string> = {
  p: '♟',
  n: '♞',
  b: '♝',
  r: '♜',
  q: '♛',
  k: '♚'
};

const MaterialValues: Record<PieceType, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0
};

export default function CapturedPieces({ captured, color }: CapturedPiecesProps) {
  if (captured.length === 0) return <div className="h-6"></div>;

  // Group captured pieces by type to show tidy multipliers like: "♟ x3"
  const counts = captured.reduce((acc, current) => {
    acc[current] = (acc[current] || 0) + 1;
    return acc;
  }, {} as Record<PieceType, number>);

  // Sort by value (Pawn -> Bishop/Knight -> Rook -> Queen)
  const sortedTypes: PieceType[] = ['p', 'n', 'b', 'r', 'q'];

  const totalValue = captured.reduce((sum, type) => sum + MaterialValues[type], 0);

  return (
    <div className={`flex items-center gap-2 px-3 py-1 bg-slate-800/40 rounded-lg text-sm select-none`}>
      <span className="text-xs font-mono tracking-wider text-slate-400 capitalize">
        Captured {color === 'w' ? 'White' : 'Black'}:
      </span>
      <div className="flex items-center gap-1.5 font-sans">
        {sortedTypes.map((type) => {
          const count = counts[type];
          if (!count) return null;
          return (
            <span
              key={type}
              className={`flex items-center ${
                color === 'w' ? 'text-slate-100 drop-shadow-sm' : 'text-slate-700 drop-shadow-[0_0_1px_rgba(255,255,255,0.4)]'
              }`}
            >
              <span className="text-[15px]">{PieceSymbols[type]}</span>
              {count > 1 && <span className="text-[10px] font-mono ml-0.5 text-slate-400">×{count}</span>}
            </span>
          );
        })}
      </div>
      {totalValue > 0 && (
        <span className="text-[10px] font-mono px-1.5 py-0.5 bg-slate-700/50 rounded text-slate-300 ml-auto">
          +{totalValue}
        </span>
      )}
    </div>
  );
}
