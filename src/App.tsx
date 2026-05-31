/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { ChessGame, RoomState, Color, Position, PieceType, ClientMessage, ServerMessage } from './types';
import { createNewGame, executeMove, getLegalMoves, isKingInCheck, findKing } from './chessEngine';
import ChessBoard from './components/ChessBoard';
import CapturedPieces from './components/CapturedPieces';
import MoveHistory from './components/MoveHistory';
import ChatBox from './components/ChatBox';
import { Volume2, VolumeX, Shield, RotateCcw, Award, Radio, Users, CheckCircle, AlertCircle, Copy, Check, ArrowRight, CornerDownLeft, Play } from 'lucide-react';

export default function App() {
  // Mode selection
  const [gameMode, setGameMode] = useState<'local' | 'online' | null>(null);

  // Connection metadata
  const [playerName, setPlayerName] = useState(() => {
    return localStorage.getItem('chess_player_name') || 'Player ' + Math.floor(Math.random() * 100);
  });
  const [roomIdInput, setRoomIdInput] = useState('');
  const [joinedRoomId, setJoinedRoomId] = useState<string | null>(null);

  // Active game states
  const [localGame, setLocalGame] = useState<ChessGame>(() => createNewGame());
  const [onlineRoom, setOnlineRoom] = useState<RoomState | null>(null);
  const [myColor, setMyColor] = useState<Color | null>(null); // 'w', 'b' or null (spectator)
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);

  // Interactive UI helpers
  const [selectedSquare, setSelectedSquare] = useState<Position | null>(null);
  const [legalMoves, setLegalMoves] = useState<Position[]>([]);
  const [isFlipped, setIsFlipped] = useState(false);
  const [autoFlip, setAutoFlip] = useState(false); // In local play, auto-rotate board every turn
  const [promotionPending, setPromotionPending] = useState<{ from: Position; to: Position } | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [copied, setCopied] = useState(false);

  // Networking Websocket
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [chatMessages, setChatMessages] = useState<{ sender: string; text: string; time: string }[]>([]);
  const [appError, setAppError] = useState<string | null>(null);

  // Sound Synth Synthesizer (Web Audio API)
  const playSound = (type: 'move' | 'capture' | 'check' | 'gameover') => {
    if (!soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'move') {
        osc.frequency.setValueAtTime(320, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(700, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.04, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
      } else if (type === 'capture') {
        osc.frequency.setValueAtTime(220, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(140, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.06, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      } else if (type === 'check') {
        osc.frequency.setValueAtTime(560, ctx.currentTime);
        osc.frequency.setValueAtTime(440, ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.06, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
        osc.start();
        osc.stop(ctx.currentTime + 0.22);
      } else if (type === 'gameover') {
        // Play a nice fanfare
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.setValueAtTime(554.37, ctx.currentTime + 0.12);
        osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.24);
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.36);
        gain.gain.setValueAtTime(0.05, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
        osc.start();
        osc.stop(ctx.currentTime + 0.6);
      }
    } catch (e) {
      // Ignored if browser policy blocks instant audio
    }
  };

  // Persist player name edits
  const handleNameChange = (val: string) => {
    setPlayerName(val);
    localStorage.setItem('chess_player_name', val);
  };

  // Close server socket helper
  const disconnectSocket = () => {
    if (socket) {
      socket.close();
      setSocket(null);
    }
    setJoinedRoomId(null);
    setOnlineRoom(null);
    setMyColor(null);
    setChatMessages([]);
  };

  // Return to mode screen
  const handleExitToMenu = () => {
    disconnectSocket();
    setGameMode(null);
    setAppError(null);
    setSelectedSquare(null);
    setLegalMoves([]);
  };

  // Automatic sound trigger based on moves history length changes
  const activeHistory = gameMode === 'online' ? onlineRoom?.game.history : localGame.history;
  const prevHistoryLen = useRef(0);

  useEffect(() => {
    const history = activeHistory || [];
    if (history.length > prevHistoryLen.current) {
      const lastMove = history[history.length - 1];
      if (lastMove.notation.includes('#')) {
        playSound('gameover');
      } else if (lastMove.notation.includes('+')) {
        playSound('check');
      } else if (lastMove.notation.includes('x')) {
        playSound('capture');
      } else {
        playSound('move');
      }
    }
    prevHistoryLen.current = history.length;
  }, [activeHistory]);

  // Handle board flipping for turns in local mode
  const activeTurn = gameMode === 'online' ? onlineRoom?.game.turn : localGame.turn;
  useEffect(() => {
    if (gameMode === 'local' && autoFlip) {
      setIsFlipped(activeTurn === 'b');
    }
  }, [activeTurn, autoFlip, gameMode]);

  // Connect to the full stack WebSocket room server
  const connectToWebSocket = (action: (wsConnection: WebSocket) => void) => {
    setAppError(null);
    // Build websocket URL pointing to current host /ws path
    const loc = window.location;
    const wsProtocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${loc.host}/ws`;

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setSocket(ws);
      action(ws);
    };

    ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data);
        switch (msg.type) {
          case 'room_joined':
            setJoinedRoomId(msg.roomId);
            setMyPlayerId(msg.playerId);
            if (msg.color) {
              setMyColor(msg.color);
              setIsFlipped(msg.color === 'b');
            } else {
              setMyColor(null); // Spec
            }
            break;

          case 'room_state':
            setOnlineRoom(msg.state);
            // Sync current turn spectator color settings if desired
            break;

          case 'chat_message':
            setChatMessages((prev) => [...prev, {
              sender: msg.sender,
              text: msg.text,
              time: msg.time
            }]);
            break;

          case 'error':
            setAppError(msg.message);
            break;
        }
      } catch (err) {
        console.error('Error handling WebSocket message:', err);
      }
    };

    ws.onerror = (e) => {
      setAppError('Connect failed. WebSocket is unreachable.');
    };

    ws.onclose = () => {
      setSocket(null);
      setOnlineRoom(null);
    };
  };

  const handleCreateRoom = () => {
    connectToWebSocket((ws) => {
      const msg: ClientMessage = { type: 'create_room', playerName };
      ws.send(JSON.stringify(msg));
    });
  };

  const handleJoinRoom = () => {
    if (!roomIdInput.trim()) {
      setAppError('Please enter a room code first.');
      return;
    }
    connectToWebSocket((ws) => {
      const msg: ClientMessage = { type: 'join_room', roomId: roomIdInput, playerName };
      ws.send(JSON.stringify(msg));
    });
  };

  const handleSwitchColor = (color: Color) => {
    if (socket && joinedRoomId) {
      const msg: ClientMessage = { type: 'select_color', color };
      socket.send(JSON.stringify(msg));
    }
  };

  const handleSendChatMessage = (text: string) => {
    if (socket && joinedRoomId) {
      const msg: ClientMessage = { type: 'chat_message', text };
      socket.send(JSON.stringify(msg));
    }
  };

  const transmitMove = (from: Position, to: Position, promotion?: PieceType) => {
    if (gameMode === 'local') {
      const updated = executeMove(localGame, from, to, promotion);
      setLocalGame(updated);
    } else if (gameMode === 'online' && socket && joinedRoomId) {
      const msg: ClientMessage = { type: 'make_move', from, to, promotion };
      socket.send(JSON.stringify(msg));
    }
  };

  // Interactive Clicking Moves Handler
  const handleSquareClick = (r: number, c: number) => {
    const game = gameMode === 'online' ? onlineRoom?.game : localGame;
    if (!game) return;

    // Reject moves if game is not active
    if (game.status !== 'active') {
      setSelectedSquare(null);
      setLegalMoves([]);
      return;
    }

    const piece = game.board[r][c];

    // If a piece from their own turn color is clicked, select it and show legal moves
    if (piece && piece.color === game.turn) {
      // In online mode, you can only pick and move your own assigned color
      if (gameMode === 'online' && piece.color !== myColor) {
        return;
      }
      setSelectedSquare({ r, c });
      setLegalMoves(getLegalMoves(game, r, c));
      return;
    }

    // If they already selected a piece and click on a legal move destination
    if (selectedSquare) {
      const isValid = legalMoves.some((m) => m.r === r && m.c === c);
      if (isValid) {
        const sourcePiece = game.board[selectedSquare.r][selectedSquare.c];

        // Check if movement triggers a promotion modal
        if (sourcePiece?.type === 'p' && (r === 0 || r === 7)) {
          setPromotionPending({ from: selectedSquare, to: { r, c } });
        } else {
          transmitMove(selectedSquare, { r, c });
        }
      }
      setSelectedSquare(null);
      setLegalMoves([]);
    }
  };

  const handlePromotionSelect = (type: PieceType) => {
    if (promotionPending) {
      transmitMove(promotionPending.from, promotionPending.to, type);
      setPromotionPending(null);
    }
  };

  // Local actions
  const handleLocalReset = () => {
    setLocalGame(createNewGame());
    setSelectedSquare(null);
    setLegalMoves([]);
  };

  // Online action transmits
  const handleOnlineResign = () => {
    if (socket && joinedRoomId) {
      socket.send(JSON.stringify({ type: 'resign' } as ClientMessage));
    }
  };

  const handleOnlineOfferDraw = () => {
    if (socket && joinedRoomId) {
      socket.send(JSON.stringify({ type: 'offer_draw' } as ClientMessage));
    }
  };

  const handleOnlineAcceptDraw = () => {
    if (socket && joinedRoomId) {
      socket.send(JSON.stringify({ type: 'accept_draw' } as ClientMessage));
    }
  };

  const handleOnlineReset = () => {
    if (socket && joinedRoomId) {
      socket.send(JSON.stringify({ type: 'reset_game' } as ClientMessage));
    }
  };

  // Copy Room URL Link
  const handleCopyCode = () => {
    if (!joinedRoomId) return;
    navigator.clipboard.writeText(joinedRoomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Derive board values for current render target
  const activeGame = gameMode === 'online' ? onlineRoom?.game : localGame;

  // Find King in Check coord
  let checkedKingPos: Position | null = null;
  if (activeGame) {
    const turn = activeGame.turn;
    const inCheck = isKingInCheck(activeGame.board, turn);
    if (inCheck) {
      checkedKingPos = findKing(activeGame.board, turn);
    }
  }

  // Find last played move in history
  const lastMovePlayed = activeGame && activeGame.history.length > 0
    ? activeGame.history[activeGame.history.length - 1]
    : null;

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 flex flex-col items-center selection:bg-emerald-500/30">
      {/* Absolute floating notifications */}
      {appError && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-4 py-3 bg-rose-600 border border-rose-500 rounded-xl text-sm shadow-xl animate-fade-in animate-bounce">
          <AlertCircle size={16} />
          <span>{appError}</span>
          <button onClick={() => setAppError(null)} className="ml-2 font-bold hover:text-rose-100 text-xs">✕</button>
        </div>
      )}

      {/* Main Header bar */}
      <header className="w-full max-w-6xl px-4 md:px-6 py-5 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 via-emerald-500 to-teal-400 flex items-center justify-center font-bold text-slate-950 shadow-lg shadow-emerald-500/10">
            <span className="text-xl">♔</span>
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-tight">Chess with Friends</h1>
            <p className="text-[10px] font-mono text-slate-400">Play locally or host rooms in real-time</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Audio toggle button */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 transition-colors text-slate-300 shadow-sm"
            title={soundEnabled ? "Mute sounds" : "Unmute sounds"}
          >
            {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
          </button>

          {gameMode && (
            <button
              onClick={handleExitToMenu}
              className="px-3.5 py-1.5 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 hover:border-slate-600 rounded-xl text-xs font-semibold cursor-pointer text-slate-200 transition-all shadow-sm"
            >
              Exit Game
            </button>
          )}
        </div>
      </header>

      {/* Primary Container */}
      <main className="w-full max-w-6xl px-4 md:px-6 py-8 flex-1 flex flex-col items-center justify-center">
        {!gameMode ? (
          /* SECTION: Welcome & Mode Selection Screen */
          <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 p-6 md:p-8 rounded-2xl shadow-2xl shadow-black/40 space-y-6">
            <div className="text-center space-y-1.5">
              <h2 className="text-xl font-bold tracking-tight text-white select-none">
                Choose Game Mode
              </h2>
              <p className="text-xs text-slate-400">
                Play on a single device or host a real-time room to share with a friend.
              </p>
            </div>

            {/* Nickname selection */}
            <div className="space-y-2">
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                Your Nickname
              </label>
              <div className="relative">
                <input
                  type="text"
                  maxLength={15}
                  value={playerName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-850 rounded-xl font-medium text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-shadow"
                  placeholder="Anonymous"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 pt-2">
              {/* Option A: Local Same Seat */}
              <button
                id="mode-local-btn"
                onClick={() => setGameMode('local')}
                className="group flex items-start gap-4 p-4.5 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 hover:border-slate-500/80 rounded-xl transition-all cursor-pointer text-left shadow-md hover:shadow-lg"
              >
                <div className="p-2.5 bg-slate-700/60 group-hover:bg-amber-500/20 text-amber-400 rounded-lg transition-colors">
                  <Users size={18} />
                </div>
                <div className="space-y-0.5">
                  <span className="text-sm font-semibold text-slate-150 group-hover:text-amber-300 transition-colors">
                    Pass & Play (Local)
                  </span>
                  <p className="text-[11px] text-slate-400">
                    Two players take turns on the same device screen. Flip board after turns automatically.
                  </p>
                </div>
              </button>

              {/* Option B: Online Remote Room */}
              <button
                id="mode-online-btn"
                onClick={() => setGameMode('online')}
                className="group flex items-start gap-4 p-4.5 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 hover:border-slate-500/80 rounded-xl transition-all cursor-pointer text-left shadow-md hover:shadow-lg"
              >
                <div className="p-2.5 bg-slate-700/60 group-hover:bg-emerald-500/20 text-emerald-400 rounded-lg transition-colors">
                  <Radio size={18} />
                </div>
                <div className="space-y-0.5">
                  <span className="text-sm font-semibold text-slate-150 group-hover:text-emerald-300 transition-colors">
                    Real-time Online Room
                  </span>
                  <p className="text-[11px] text-slate-400">
                    Host a game or paste a room code. Connects instantly using WebSockets.
                  </p>
                </div>
              </button>
            </div>
          </div>
        ) : gameMode === 'online' && !joinedRoomId ? (
          /* SECTION: Online Room Creation / Entrance Lobby */
          <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 p-6 md:p-8 rounded-2xl shadow-2xl shadow-black/40 space-y-6">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setGameMode(null)}
                className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
                id="online-back-btn"
              >
                ← Back
              </button>
              <div className="h-4 w-px bg-slate-805"></div>
              <span className="text-xs font-mono text-amber-500 font-bold">{playerName}</span>
            </div>

            <div className="space-y-4">
              {/* Box 1: Host a game */}
              <div className="p-4 bg-slate-800/40 border border-slate-700/50 rounded-xl space-y-2.5">
                <span className="text-xs font-bold text-slate-350 tracking-wide block">
                  Host New Room
                </span>
                <p className="text-[11px] text-slate-450">
                  Generate a clean, secure lobby and get an invitation code.
                </p>
                <button
                  onClick={handleCreateRoom}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg cursor-pointer transition shadow hover:shadow-emerald-900/30 flex items-center justify-center gap-1.5"
                >
                  Create Room <Play size={12} fill="currentColor" />
                </button>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500 font-mono">
                <div className="h-px flex-1 bg-slate-800"></div>
                <span className="px-3 text-slate-500">or</span>
                <div className="h-px flex-1 bg-slate-800"></div>
              </div>

              {/* Box 2: Join a game */}
              <div className="p-4 bg-slate-800/40 border border-slate-700/50 rounded-xl space-y-3">
                <span className="text-xs font-bold text-slate-350 tracking-wide block">
                  Join via Room Code
                </span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    maxLength={5}
                    value={roomIdInput}
                    onChange={(e) => setRoomIdInput(e.target.value.toUpperCase())}
                    className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-600 font-bold uppercase tracking-wider text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    placeholder="E.G. A4BC"
                  />
                  <button
                    onClick={handleJoinRoom}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-white text-xs font-bold rounded-lg cursor-pointer transition flex items-center gap-1"
                  >
                    Join <ArrowRight size={12} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* SECTION: Active Chess Play Screen */
          <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left/Middle Column (Chessboard & Captures) (8 cols) */}
            <div className="lg:col-span-8 flex flex-col items-center gap-4">
              {/* Info panel */}
              <div className="w-full max-w-xl flex items-center justify-between px-2 text-xs">
                {/* Mode description & Room information */}
                <div>
                  {gameMode === 'local' ? (
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-slate-800/80 border border-slate-700/60 text-[10px] text-amber-400 font-bold rounded-md">
                        Pass & Play (Local)
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2.5">
                      <span className="px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-400 font-bold rounded font-mono">
                        ROOM: {joinedRoomId}
                      </span>
                      <button
                        onClick={handleCopyCode}
                        className="p-1 rounded bg-slate-800 text-slate-400 hover:text-slate-150 border border-slate-700/60 flex items-center gap-1 cursor-pointer"
                        title="Copy Room Code"
                      >
                        {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                        <span className="text-[10px] pr-0.5">{copied ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Who am I inside this Room */}
                {gameMode === 'online' && (
                  <div className="flex items-center gap-2.5">
                    <span className="text-[11px] font-mono text-slate-400">Playing as:</span>
                    <span className={`px-2 py-0.5 font-bold rounded text-[10px] ${
                      myColor === 'w'
                        ? 'bg-amber-100 text-slate-900'
                        : myColor === 'b'
                        ? 'bg-slate-800 border border-slate-600 text-white'
                        : 'bg-slate-750 text-slate-350'
                    }`}>
                      {myColor === 'w' ? 'White' : myColor === 'b' ? 'Black' : 'Spectator'}
                    </span>
                  </div>
                )}
              </div>

              {/* Display Captured Pieces (top side captures: held by top visual side) */}
              <div className="w-full max-w-xl">
                <CapturedPieces
                  captured={isFlipped ? activeGame!.capturedPieces.b : activeGame!.capturedPieces.w}
                  color={isFlipped ? 'b' : 'w'}
                />
              </div>

              {/* The chessboard itself */}
              <ChessBoard
                board={activeGame!.board}
                turn={activeGame!.turn}
                selectedSquare={selectedSquare}
                legalMoves={legalMoves}
                onSquareClick={handleSquareClick}
                isFlipped={isFlipped}
                lastMove={lastMovePlayed ? { from: lastMovePlayed.from, to: lastMovePlayed.to } : null}
                kingInCheckPos={checkedKingPos}
              />

              {/* Display Captured Pieces (bottom side captures) */}
              <div className="w-full max-w-xl">
                <CapturedPieces
                  captured={isFlipped ? activeGame!.capturedPieces.w : activeGame!.capturedPieces.b}
                  color={isFlipped ? 'w' : 'b'}
                />
              </div>

              {/* Pawn Promotion Modal (Conditional Overlay) */}
              {promotionPending && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
                  <div className="bg-[#1E293B] border border-slate-800 p-6 rounded-xl shadow-2xl max-w-sm w-full text-center space-y-4">
                     <h3 className="text-sm font-bold text-white tracking-widest uppercase">Pawn Promotion</h3>
                     <p className="text-[11px] text-slate-400">Choose a piece to upgrade your pawn into:</p>
                    <div className="grid grid-cols-4 gap-2.5 pt-2">
                      {(['q', 'r', 'b', 'n'] as PieceType[]).map((type) => {
                        const promotionSymbols: Record<PieceType, string> = {
                          q: '♛',
                          r: '♜',
                          b: '♝',
                          n: '♞',
                          p: '♟',
                          k: '♚'
                        };
                        return (
                          <button
                            key={type}
                            onClick={() => handlePromotionSelect(type)}
                            className="p-4 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 rounded-lg text-3xl text-emerald-400 cursor-pointer hover:scale-105 active:scale-95 text-center flex items-center justify-center transition-all"
                          >
                            {promotionSymbols[type]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column (Control Panel, Status, Move History & Chat) (4 cols) */}
            <div className="lg:col-span-4 flex flex-col gap-5">
              {/* Game Status Card */}
              <div className="bg-slate-900/40 p-5 border border-slate-800 rounded-2xl flex flex-col gap-4 shadow-xl">
                <span className="text-[11.5px] font-bold tracking-wider text-slate-400 uppercase">
                  Game Status
                </span>

                {/* Sub status row */}
                <div className="flex items-center gap-3">
                  {activeGame?.status === 'active' ? (
                    <>
                      <div className={`w-3 h-3 rounded-full ${
                        activeGame.turn === 'w' ? 'bg-amber-100 shadow-[0_0_8px_rgba(255,255,255,0.4)]' : 'bg-slate-800 border border-slate-600'
                      }`} />
                      <span className="text-sm font-semibold text-slate-200">
                        {activeGame.turn === 'w' ? "White's turn" : "Black's turn"} to move
                      </span>
                    </>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="p-1 px-2.5 bg-emerald-500/15 border border-emerald-500/30 rounded-lg text-emerald-400 text-xs font-bold leading-none flex items-center gap-1">
                        <Award size={13} />
                        Game Over
                      </div>
                      <span className="text-xs text-slate-300 font-semibold">
                        {activeGame?.status === 'checkmate' && `Won by ${activeGame.winner === 'w' ? 'White' : 'Black'} via checkmate!`}
                        {activeGame?.status === 'resigned' && `Won by ${activeGame.winner === 'w' ? 'White' : 'Black'} (resignation)`}
                        {activeGame?.status === 'stalemate' && 'Draw (stalemate reached)'}
                        {activeGame?.status === 'draw' && 'Draw agreed'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Local specific settings */}
                {gameMode === 'local' && (
                  <div className="flex flex-col gap-2 p-2 bg-slate-950/40 rounded-xl border border-slate-850">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-slate-300 cursor-pointer select-none" htmlFor="auto-flip">
                        Auto-rotate board
                      </label>
                      <input
                        type="checkbox"
                        id="auto-flip"
                        checked={autoFlip}
                        onChange={(e) => {
                          setAutoFlip(e.target.checked);
                          if (!e.target.checked) setIsFlipped(false); // Reset to White bottom if unchecked
                        }}
                        className="w-4 h-4 cursor-pointer accent-emerald-500"
                      />
                    </div>
                  </div>
                )}

                {/* Game Action Controls */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setIsFlipped(!isFlipped)}
                    className="py-2.5 px-3 bg-slate-800 hover:bg-slate-705 border border-slate-700 hover:border-slate-600 rounded-xl cursor-pointer text-xs font-semibold text-slate-200 transition-all flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    Flip Board
                  </button>

                  {gameMode === 'local' ? (
                    <button
                      onClick={handleLocalReset}
                      className="py-2.5 px-3 bg-slate-800/60 hover:bg-slate-800 hover:text-white border border-slate-700/50 hover:border-slate-600 rounded-xl cursor-pointer text-xs font-semibold text-slate-300 transition-all flex items-center justify-center gap-1.5"
                    >
                      <RotateCcw size={12} /> Reset Board
                    </button>
                  ) : (
                    <>
                      {activeGame?.status === 'active' && (
                        <>
                          <button
                            onClick={handleOnlineOfferDraw}
                            className="py-2 px-3 bg-slate-800/80 hover:bg-slate-750 border border-slate-700 rounded-xl cursor-pointer text-xs font-semibold text-slate-200 transition shadow-sm"
                          >
                            Offer Draw
                          </button>
                          <button
                            onClick={handleOnlineResign}
                            className="py-2 px-3 bg-rose-650/10 hover:bg-rose-600/20 border border-rose-500/20 hover:border-rose-500/40 text-rose-305 hover:text-rose-200 rounded-xl cursor-pointer text-xs font-semibold transition"
                          >
                            Resign
                          </button>
                        </>
                      )}

                      {/* Display drawing options if check conditions are met */}
                      {chatMessages.some(m => m.text.includes('offered a draw') && m.sender === 'System') && activeGame?.status === 'active' && (
                        <button
                          onClick={handleOnlineAcceptDraw}
                          className="col-span-2 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500 rounded-xl cursor-pointer text-xs font-bold transition flex items-center justify-center gap-1.5"
                        >
                          Accept Draw Offer 🤝
                        </button>
                      )}

                      {/* Reset Board button in remote room */}
                      <button
                        onClick={handleOnlineReset}
                        className="col-span-2 py-2 px-3 bg-slate-800/40 hover:bg-slate-800 text-slate-300 hover:text-slate-100 border border-slate-700/45 hover:border-slate-700/90 rounded-xl cursor-pointer text-xs font-semibold transition-all flex items-center justify-center gap-1.5"
                      >
                        <RotateCcw size={12} /> Reset Game Board
                      </button>
                    </>
                  )}
                </div>

                {/* Remote Room Seats Info */}
                {gameMode === 'online' && onlineRoom && (
                  <div className="flex flex-col gap-1.5 p-2 bg-slate-950/40 rounded-xl text-[11px] border border-slate-850">
                    <span className="font-bold text-slate-500 uppercase tracking-wider mb-0.5 block">Room Players</span>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">White Player:</span>
                      <span className="font-bold text-slate-200 truncate max-w-[120px]">
                        {onlineRoom.players.w ? onlineRoom.players.w.name : 'Empty seat'}
                      </span>
                      {!onlineRoom.players.w && myColor !== 'w' && (
                        <button
                          onClick={() => handleSwitchColor('w')}
                          className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 font-bold text-white text-[9px] rounded cursor-pointer leading-tight"
                        >
                          Sit
                        </button>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Black Player:</span>
                      <span className="font-bold text-slate-200 truncate max-w-[120px]">
                        {onlineRoom.players.b ? onlineRoom.players.b.name : 'Empty seat'}
                      </span>
                      {!onlineRoom.players.b && myColor !== 'b' && (
                        <button
                          onClick={() => handleSwitchColor('b')}
                          className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 font-bold text-white text-[9px] rounded cursor-pointer leading-tight"
                        >
                          Sit
                        </button>
                      )}
                    </div>
                    {onlineRoom.spectators.length > 0 && (
                      <div className="text-slate-500 pt-1 border-t border-slate-800/50 truncate">
                        Spectating: {onlineRoom.spectators.map(s => s.name).join(', ')}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Move History Log (autoscrolls) */}
              <MoveHistory history={activeGame!.history} />

              {/* Chat panel */}
              {gameMode === 'online' && (
                <ChatBox
                  messages={chatMessages}
                  onSendMessage={handleSendChatMessage}
                  isConnected={!!socket}
                />
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
