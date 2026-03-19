import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { config } from '../../config/index';
import { logger } from '../../utils/logger';
import { redisManager } from '../redis/RedisManager';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import type { Connection, Message, Room, EventPayload } from '../../types/index';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
  roomId?: string;
  lastActivity?: Date;
}

export class WebSocketServer extends EventEmitter {
  private io: SocketIOServer;
  private connections: Map<string, AuthenticatedSocket> = new Map();
  private rooms: Map<string, Room> = new Map();
  private connectionCounter: number = 0;
  private messageCounter: number = 0;
  private startTime: number = Date.now();

  constructor(httpServer: HTTPServer) {
    super();
    
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.CORS_ORIGIN || '*',
        methods: ['GET', 'POST'],
        credentials: true,
      },
      pingInterval: config.websocket.pingInterval,
      pingTimeout: config.websocket.pingTimeout,
      perMessageDeflate: config.websocket.perMessageDeflate ? {
        threshold: 1024,
      } : false,
      transports: ['websocket', 'polling'],
      allowEIO3: true,
      serveClient: false,
    });

    this.setupMiddleware();
    this.setupEventHandlers();
    this.setupRedisPubSub();
    
    logger.info('WebSocket Server initialized');
  }

  private setupMiddleware(): void {
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      const startTime = Date.now();
      
      try {
        const token = socket.handshake.auth.token || socket.handshake.query.token;
        
        if (token) {
          const user = await this.authenticateToken(token);
          if (user) {
            socket.userId = user.id;
            socket.username = user.username;
          }
        }

        const clientIp = socket.handshake.headers['x-forwarded-for']?.toString() || 
                         socket.handshake.address;
        
        logger.debug('WebSocket middleware', {
          socketId: socket.id,
          userId: socket.userId,
          ip: clientIp,
          latency: Date.now() - startTime,
        });

        next();
      } catch (error) {
        logger.error('WebSocket middleware error', { error });
        next(new Error('Authentication error'));
      }
    });
  }

  private setupEventHandlers(): void {
    this.io.on('connection', (socket: AuthenticatedSocket) => {
      this.handleConnection(socket);
    });

    this.io.on('disconnect', (socket: AuthenticatedSocket) => {
      this.handleDisconnection(socket);
    });

    this.io.on('error', (error: Error) => {
      logger.error('WebSocket server error', { error: error.message });
    });
  }

  private async setupRedisPubSub(): Promise<void> {
    try {
      await redisManager.subscribe('broadcast', (message) => {
        this.io.emit('broadcast', message);
      });

      await redisManager.subscribe('notification', (message) => {
        const msgData = message.message as { targetUserId?: string };
        if (msgData.targetUserId) {
          this.sendToUser(msgData.targetUserId, 'notification', message.message);
        } else {
          this.io.emit('notification', message);
        }
      });

      logger.info('Redis Pub/Sub subscriptions established');
    } catch (error) {
      logger.error('Failed to setup Redis Pub/Sub', { error });
    }
  }

  private async handleConnection(socket: AuthenticatedSocket): Promise<void> {
    this.connectionCounter++;
    
    const connection: Connection = {
      id: uuidv4(),
      userId: socket.userId,
      socketId: socket.id,
      type: 'websocket',
      ip: socket.handshake.address,
      connectedAt: new Date(),
      lastActivity: new Date(),
    };

    this.connections.set(socket.id, socket as AuthenticatedSocket);
    
    await redisManager.trackConnection(socket.id, socket.userId);

    logger.info('Client connected', {
      socketId: socket.id,
      userId: socket.userId,
      totalConnections: this.connections.size,
    });

    socket.emit('connected', {
      socketId: socket.id,
      timestamp: new Date().toISOString(),
    });

    socket.on('message', (data: unknown) => this.handleMessage(socket, data));
    socket.on('join_room', (roomId: string) => this.handleJoinRoom(socket, roomId));
    socket.on('leave_room', (roomId: string) => this.handleLeaveRoom(socket, roomId));
    socket.on('ping', () => socket.emit('pong', { timestamp: Date.now() }));
    socket.on('subscribe', (channel: string) => this.handleSubscribe(socket, channel));
    socket.on('unsubscribe', (channel: string) => this.handleUnsubscribe(socket, channel));

    this.emit('connection', connection);
  }

  private async handleDisconnection(socket: AuthenticatedSocket): Promise<void> {
    this.connectionCounter--;
    this.connections.delete(socket.id);
    
    await redisManager.untrackConnection(socket.id);

    if (socket.roomId) {
      await this.handleLeaveRoom(socket, socket.roomId);
    }

    logger.info('Client disconnected', {
      socketId: socket.id,
      userId: socket.userId,
      totalConnections: this.connections.size,
    });

    this.emit('disconnection', { socketId: socket.id, userId: socket.userId });
  }

  private async handleMessage(socket: AuthenticatedSocket, data: unknown): Promise<void> {
    const message = data as Message;
    this.messageCounter++;
    
    const payload: EventPayload = {
      event: 'message',
      data: message,
      timestamp: new Date(),
      source: socket.id,
    };

    socket.lastActivity = new Date();

    if (message.type === 'chat') {
      if (message.channel) {
        this.io.to(message.channel).emit('message', payload);
        await redisManager.publish(`room:${message.channel}:messages`, payload);
      } else if (message.recipient) {
        this.sendToUser(message.recipient, 'message', payload);
      }
    } else {
      socket.emit('ack', { 
        messageId: message.id, 
        status: 'delivered',
        timestamp: Date.now(),
      });
    }

    this.emit('message', payload);
  }

  private async handleJoinRoom(socket: AuthenticatedSocket, roomId: string): Promise<void> {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        id: roomId,
        name: roomId,
        members: new Set(),
        createdAt: new Date(),
      });
    }

    const room = this.rooms.get(roomId)!;
    room.members.add(socket.id);
    socket.roomId = roomId;
    socket.join(roomId);

    logger.debug('Client joined room', { socketId: socket.id, roomId });

    socket.emit('joined_room', { roomId, timestamp: new Date().toISOString() });
    
    socket.to(roomId).emit('user_joined', {
      socketId: socket.id,
      username: socket.username,
      roomId,
      members: room.members.size,
    });

    await redisManager.publish('room_events', {
      type: 'join',
      roomId,
      socketId: socket.id,
      userId: socket.userId,
    });
  }

  private async handleLeaveRoom(socket: AuthenticatedSocket, roomId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (room) {
      room.members.delete(socket.id);
      socket.leave(roomId);
      socket.roomId = undefined;

      logger.debug('Client left room', { socketId: socket.id, roomId });

      socket.emit('left_room', { roomId, timestamp: new Date().toISOString() });
      
      socket.to(roomId).emit('user_left', {
        socketId: socket.id,
        username: socket.username,
        roomId,
        members: room.members.size,
      });

      if (room.members.size === 0) {
        this.rooms.delete(roomId);
      }

      await redisManager.publish('room_events', {
        type: 'leave',
        roomId,
        socketId: socket.id,
        userId: socket.userId,
      });
    }
  }

  private async handleSubscribe(socket: AuthenticatedSocket, channel: string): Promise<void> {
    socket.join(`channel:${channel}`);
    logger.debug('Client subscribed to channel', { socketId: socket.id, channel });
    socket.emit('subscribed', { channel });
  }

  private async handleUnsubscribe(socket: AuthenticatedSocket, channel: string): Promise<void> {
    socket.leave(`channel:${channel}`);
    logger.debug('Client unsubscribed from channel', { socketId: socket.id, channel });
    socket.emit('unsubscribed', { channel });
  }

  private async authenticateToken(_token: string): Promise<{ id: string; username: string } | null> {
    try {
      return { id: 'user-123', username: 'anonymous' };
    } catch {
      return null;
    }
  }

  sendToUser(userId: string, event: string, data: unknown): void {
    for (const [_socketId, socket] of this.connections) {
      if (socket.userId === userId) {
        socket.emit(event, data);
      }
    }
  }

  broadcastToRoom(roomId: string, event: string, data: unknown, exclude?: string): void {
    if (exclude) {
      this.io.to(roomId).emit(event, data);
    } else {
      this.io.to(roomId).emit(event, data);
    }
  }

  broadcastToChannel(channel: string, event: string, data: unknown): void {
    this.io.to(`channel:${channel}`).emit(event, data);
  }

  async broadcastToAllNodes(event: string, data: unknown): Promise<void> {
    await redisManager.publish('broadcast', { event, data, source: config.node.instanceId });
  }

  getConnectionCount(): number {
    return this.connections.size;
  }

  getRoomCount(): number {
    return this.rooms.size;
  }

  getStats(): { connections: number; rooms: number; messages: number; uptime: number } {
    return {
      connections: this.connections.size,
      rooms: this.rooms.size,
      messages: this.messageCounter,
      uptime: Date.now() - this.startTime,
    };
  }

  async shutdown(): Promise<void> {
    logger.info('WebSocket Server shutting down');
    
    for (const socket of this.connections.values()) {
      socket.emit('server_shutdown', { reason: 'Server maintenance' });
      socket.disconnect(true);
    }
    
    this.connections.clear();
    this.rooms.clear();
    this.io.close();
  }
}
