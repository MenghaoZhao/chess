/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import { MoveRecord } from '../types';

interface MoveHistoryProps {
  history: MoveRecord[];
}

export default function MoveHistory({ history }: MoveHistoryProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Parse moves into pairs: [ {w: MoveRecord, b?: MoveRecord} ]
  const pairs: { index: number; w: MoveRecord; b?: MoveRecord }[] = [];
  for (let i = 0; i < history.length; i += 2) {
    pairs.push({
      index: Math.floor(i / 2) + 1,
      w: history[i],
      b: history[i + 1]
    });
  }

  // Auto-scroll to the bottom when new moves are played
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history]);

  return (
    <div className="flex flex-col h-full max-h-[220px] md:max-h-full min-h-[140px] bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden shadow-inner select-none">
      <div className="px-4 py-3 bg-slate-900/60 border-b border-slate-800 flex items-center justify-between">
        <span className="text-xs font-bold tracking-wider text-slate-400 uppercase">
          Move Log
        </span>
        <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-950/60 border border-slate-800/40 rounded text-slate-400">
          {history.length} ply{history.length === 1 ? '' : 's'}
        </span>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 p-3 overflow-y-auto font-mono text-sm space-y-1 divide-y divide-slate-800/40"
      >
        {pairs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs text-slate-500 py-8">
            No moves recorded yet
          </div>
        ) : (
          pairs.map((pair, idx) => (
            <div
              key={pair.index}
              className={`grid grid-cols-12 gap-1 py-1 text-slate-300 hover:bg-slate-800/20 px-1 rounded ${
                idx === pairs.length - 1 ? 'bg-amber-500/5 text-amber-100 font-medium' : ''
              }`}
            >
              <div className="col-span-2 text-slate-500 text-right pr-2">
                {pair.index}.
              </div>
              <div className="col-span-5 hover:text-slate-100 transition-colors">
                {pair.w.notation}
              </div>
              <div className="col-span-5 hover:text-slate-100 transition-colors">
                {pair.b ? pair.b.notation : <span className="text-slate-600">···</span>}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
