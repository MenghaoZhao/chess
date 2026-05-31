/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type PieceType = 'p' | 'r' | 'n' | 'b' | 'q' | 'k';
export type Color = 'w' | 'b';

export interface Piece {
  id: string; // Unique ID for key mapping and animation
  type: PieceType;
  color: Color;
  hasMoved?: boolean;
}

export type Board = (Piece | null)[][];

export interface Position {
  r: number; // Row (0 to 7, where 0 is rank 8, 7 is rank 1)
  c: number; // Col (0 to 7, where 0 is 'a', 7 is 'h')
}

export interface MoveRecord {
  from: Position;
  to: Position;
  piece: Piece;
  captured?: Piece | null;
  notation: string;
  isCastling?: boolean;
  isEnPassant?: boolean;
  promotion?: PieceType;
}

export interface CastlingRights {
  kingSide: boolean;
  queenSide: boolean;
}

export interface ChessGame {
  id: string;
  board: Board;
  turn: Color;
  castlingRights: {
    w: CastlingRights;
    b: CastlingRights;
  };
  enPassantTarget: Position | null; // Square behind the double-stepped pawn
  capturedPieces: {
    w: PieceType[]; // Captured white pieces (held by Black)
    b: PieceType[]; // Captured black pieces (held by White)
  };
  history: MoveRecord[];
  status: 'active' | 'checkmate' | 'stalemate' | 'draw' | 'resigned';
  winner: Color | 'draw' | null;
}

export interface RoomState {
  roomId: string;
  game: ChessGame;
  players: {
    w?: { id: string; name: string };
    b?: { id: string; name: string };
  };
  spectators: { id: string; name: string }[];
}

// WebSocket connection events
export type ClientMessage =
  | { type: 'create_room'; playerName: string }
  | { type: 'join_room'; roomId: string; playerName: string }
  | { type: 'select_color'; color: Color }
  | { type: 'make_move'; from: Position; to: Position; promotion?: PieceType }
  | { type: 'reset_game' }
  | { type: 'resign' }
  | { type: 'offer_draw' }
  | { type: 'accept_draw' }
  | { type: 'chat_message'; text: string };

export type ServerMessage =
  | { type: 'room_joined'; roomId: string; playerId: string; color?: Color }
  | { type: 'room_state'; state: RoomState }
  | { type: 'error'; message: string }
  | { type: 'chat_message'; sender: string; text: string; time: string };
