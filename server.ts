/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';

// Load environment variables
dotenv.config();

// Imports from local source files
import { ClientMessage, ServerMessage, RoomState, Color, Position, PieceType } from './src/types';
import { createNewGame, executeMove, getLegalMoves } from './src/chessEngine';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

const PORT = 3000;

// In-memory state
const rooms = new Map<string, RoomState>();
// Map WebSocket instances to metadata
interface ConnectionData {
  id: string;
  name: string;
  roomId?: string;
}
const clients = new Map<WebSocket, ConnectionData>();

// Generate short room IDs (A-Z, 0-9)
function generateRoomId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid confusing glyphs like I, 1, O, 0
  let id = '';
  for (let i = 0; i < 4; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  // Ensure uniqueness
  if (rooms.has(id)) return generateRoomId();
  return id;
}

// Convert absolute to relative path for ESM compat if needed
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to broadcast room state to all players & spectators in that room
function broadcastToRoom(roomId: string, message: ServerMessage) {
  const serialized = JSON.stringify(message);
  for (const [ws, data] of clients.entries()) {
    if (data.roomId === roomId && ws.readyState === WebSocket.OPEN) {
      ws.send(serialized);
    }
  }
}

// REST endpoints FIRST
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', playersCount: clients.size, activeRooms: rooms.size });
});

// Upgrade HTTP request to WebSocket
server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname;
  if (pathname === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    // Let other requests (HMR, etc.) fall through
  }
});

// WebSocket Connection Handler
wss.on('connection', (ws) => {
  const playerId = Math.random().toString(36).substring(2, 10);
  clients.set(ws, { id: playerId, name: 'Anonymous' });

  ws.on('message', (messageStr: string) => {
    try {
      const data: ClientMessage = JSON.parse(messageStr);
      const clientData = clients.get(ws);
      if (!clientData) return;

      switch (data.type) {
        case 'create_room': {
          const roomId = generateRoomId();
          clientData.name = data.playerName || 'Player 1';
          clientData.roomId = roomId;

          // Create standard initial game state
          const game = createNewGame();
          const roomState: RoomState = {
            roomId,
            game,
            players: {
              w: { id: playerId, name: clientData.name }
            },
            spectators: []
          };

          rooms.set(roomId, roomState);

          // Acknowledge creator
          ws.send(JSON.stringify({
            type: 'room_joined',
            roomId,
            playerId,
            color: 'w'
          } as ServerMessage));

          // Broadcast overall state to room
          ws.send(JSON.stringify({
            type: 'room_state',
            state: roomState
          } as ServerMessage));
          break;
        }

        case 'join_room': {
          const targetRoomId = data.roomId.toUpperCase();
          const roomState = rooms.get(targetRoomId);

          if (!roomState) {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Room not found. Check the room code and try again.'
            } as ServerMessage));
            return;
          }

          clientData.name = data.playerName || 'Player 2';
          clientData.roomId = targetRoomId;

          // Determine position (default to black if empty, else spectate)
          let assignedColor: Color | undefined = undefined;
          if (!roomState.players.w) {
            roomState.players.w = { id: playerId, name: clientData.name };
            assignedColor = 'w';
          } else if (!roomState.players.b) {
            roomState.players.b = { id: playerId, name: clientData.name };
            assignedColor = 'b';
          } else {
            // Already full, join as spectator
            roomState.spectators.push({ id: playerId, name: clientData.name });
          }

          // Acknowledge joiner
          ws.send(JSON.stringify({
            type: 'room_joined',
            roomId: targetRoomId,
            playerId,
            color: assignedColor
          } as ServerMessage));

          // Broadcast state to everyone in room (including joiner)
          broadcastToRoom(targetRoomId, {
            type: 'room_state',
            state: roomState
          });

          // Chat greeting
          broadcastToRoom(targetRoomId, {
            type: 'chat_message',
            sender: 'System',
            text: `${clientData.name} has joined the room${assignedColor ? ` as ${assignedColor === 'w' ? 'White' : 'Black'}` : ' as a spectator'}.`,
            time: new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
          });
          break;
        }

        case 'select_color': {
          const rId = clientData.roomId;
          if (!rId) return;
          const rState = rooms.get(rId);
          if (!rState) return;

          const requestedColor = data.color;

          // If the seat is already taken
          if (rState.players[requestedColor]) {
            ws.send(JSON.stringify({
              type: 'error',
              message: `The ${requestedColor === 'w' ? 'White' : 'Black'} position is already occupied.`
            } as ServerMessage));
            return;
          }

          // Remove player from their old seat or spectator list
          let oldColor: Color | undefined;
          if (rState.players.w?.id === playerId) {
            oldColor = 'w';
            delete rState.players.w;
          } else if (rState.players.b?.id === playerId) {
            oldColor = 'b';
            delete rState.players.b;
          } else {
            rState.spectators = rState.spectators.filter(s => s.id !== playerId);
          }

          // Occupy new seat
          rState.players[requestedColor] = { id: playerId, name: clientData.name };

          // Acknowledge color change
          ws.send(JSON.stringify({
            type: 'room_joined',
            roomId: rId,
            playerId,
            color: requestedColor
          } as ServerMessage));

          // Notify everyone
          broadcastToRoom(rId, {
            type: 'room_state',
            state: rState
          });

          broadcastToRoom(rId, {
            type: 'chat_message',
            sender: 'System',
            text: `${clientData.name} switched to ${requestedColor === 'w' ? 'White' : 'Black'}.`,
            time: new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
          });
          break;
        }

        case 'make_move': {
          const rId = clientData.roomId;
          if (!rId) return;
          const rState = rooms.get(rId);
          if (!rState) return;

          const game = rState.game;
          const currentTurn = game.turn;

          // Verify that this client is the player whose turn it is
          const actingPlayer = rState.players[currentTurn];
          if (!actingPlayer || actingPlayer.id !== playerId) {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'It is not your turn, or you are a spectator!'
            } as ServerMessage));
            return;
          }

          // Double check rule legality of the move
          const { from, to, promotion } = data;
          const legalDestinations = getLegalMoves(game, from.r, from.c);
          const isLegal = legalDestinations.some(m => m.r === to.r && m.c === to.c);

          if (!isLegal) {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Illegal chess move attempted.'
            } as ServerMessage));
            return;
          }

          // Execute move update
          const updatedGame = executeMove(game, from, to, promotion || 'q');
          rState.game = updatedGame;

          // Broadcast move update
          broadcastToRoom(rId, {
            type: 'room_state',
            state: rState
          });

          // Print move in chat log
          const lastMove = updatedGame.history[updatedGame.history.length - 1];
          broadcastToRoom(rId, {
            type: 'chat_message',
            sender: 'System',
            text: `${currentTurn === 'w' ? 'White' : 'Black'} played ${lastMove.notation}.`,
            time: new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
          });

          // Check for Game Over message printing
          if (updatedGame.status === 'checkmate') {
            broadcastToRoom(rId, {
              type: 'chat_message',
              sender: 'System',
              text: `🏁 Checkmate! ${updatedGame.winner === 'w' ? 'White' : 'Black'} wins the game!`,
              time: new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
            });
          } else if (updatedGame.status === 'stalemate') {
            broadcastToRoom(rId, {
              type: 'chat_message',
              sender: 'System',
              text: `🤝 Stalemate! The game ends in a draw.`,
              time: new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
            });
          }
          break;
        }

        case 'reset_game': {
          const rId = clientData.roomId;
          if (!rId) return;
          const rState = rooms.get(rId);
          if (!rState) return;

          // Only room players can reset
          const isPlayer = rState.players.w?.id === playerId || rState.players.b?.id === playerId;
          if (!isPlayer) {
            ws.send(JSON.stringify({ type: 'error', message: 'Only active players can reset the game.' } as ServerMessage));
            return;
          }

          rState.game = createNewGame();

          broadcastToRoom(rId, {
            type: 'room_state',
            state: rState
          });

          broadcastToRoom(rId, {
            type: 'chat_message',
            sender: 'System',
            text: `🔄 The game board was reset by ${clientData.name}.`,
            time: new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
          });
          break;
        }

        case 'resign': {
          const rId = clientData.roomId;
          if (!rId) return;
          const rState = rooms.get(rId);
          if (!rState) return;

          let resColor: Color | null = null;
          if (rState.players.w?.id === playerId) resColor = 'w';
          if (rState.players.b?.id === playerId) resColor = 'b';

          if (!resColor) return;

          const oppColor = resColor === 'w' ? 'b' : 'w';

          rState.game.status = 'resigned';
          rState.game.winner = oppColor;

          broadcastToRoom(rId, {
            type: 'room_state',
            state: rState
          });

          broadcastToRoom(rId, {
            type: 'chat_message',
            sender: 'System',
            text: `🏳️ ${resColor === 'w' ? 'White' : 'Black'} has resigned. ${oppColor === 'w' ? 'White' : 'Black'} wins!`,
            time: new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
          });
          break;
        }

        case 'offer_draw': {
          const rId = clientData.roomId;
          if (!rId) return;
          const rState = rooms.get(rId);
          if (!rState) return;

          let offerColor: Color | null = null;
          if (rState.players.w?.id === playerId) offerColor = 'w';
          if (rState.players.b?.id === playerId) offerColor = 'b';

          if (!offerColor) return;

          broadcastToRoom(rId, {
            type: 'chat_message',
            sender: 'System',
            text: `🤝 ${offerColor === 'w' ? 'White' : 'Black'} offered a draw. Accept draw?`,
            time: new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
          });
          break;
        }

        case 'accept_draw': {
          const rId = clientData.roomId;
          if (!rId) return;
          const rState = rooms.get(rId);
          if (!rState) return;

          // Make sure the acceptor is a player
          const isPlayer = rState.players.w?.id === playerId || rState.players.b?.id === playerId;
          if (!isPlayer) return;

          rState.game.status = 'draw';
          rState.game.winner = 'draw';

          broadcastToRoom(rId, {
            type: 'room_state',
            state: rState
          });

          broadcastToRoom(rId, {
            type: 'chat_message',
            sender: 'System',
            text: `🤝 Draw request accepted. The game ended in a draw!`,
            time: new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
          });
          break;
        }

        case 'chat_message': {
          const rId = clientData.roomId;
          if (!rId) return;

          if (!data.text.trim()) return;

          broadcastToRoom(rId, {
            type: 'chat_message',
            sender: clientData.name,
            text: data.text,
            time: new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
          });
          break;
        }
      }
    } catch (err) {
      console.error('Error handling WebSocket message:', err);
    }
  });

  // Client Disconnect Handling
  ws.on('close', () => {
    const clientData = clients.get(ws);
    if (!clientData) return;

    const { roomId, name } = clientData;
    clients.delete(ws);

    if (roomId) {
      const roomState = rooms.get(roomId);
      if (roomState) {
        // Did an active player disconnect?
        let wasPlayer = false;
        if (roomState.players.w?.id === playerId) {
          delete roomState.players.w;
          wasPlayer = true;
        } else if (roomState.players.b?.id === playerId) {
          delete roomState.players.b;
          wasPlayer = true;
        } else {
          roomState.spectators = roomState.spectators.filter(s => s.id !== playerId);
        }

        // Notify remaining users
        broadcastToRoom(roomId, {
          type: 'room_state',
          state: roomState
        });

        broadcastToRoom(roomId, {
          type: 'chat_message',
          sender: 'System',
          text: `👋 ${name} disconnected.`,
          time: new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
        });

        // If the room has no players or spectators, clean it up
        const hasPlayers = roomState.players.w || roomState.players.b;
        const hasSpectators = roomState.spectators.length > 0;
        if (!hasPlayers && !hasSpectators) {
          rooms.delete(roomId);
        }
      }
    }
  });
});

async function start() {
  // Vite integration
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Bind server to port 3000 and 0.0.0.0
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Chess Backend] Server running on http://localhost:${PORT}`);
  });
}

start();
