import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

/**
 * WebSocket Gateway for real-time swap transaction notifications
 * 
 * Clients can subscribe to transaction updates by reference
 * Authentication via JWT token in handshake auth
 */
@WebSocketGateway({
  cors: {
    origin: '*', // Configure appropriately for production
    credentials: true,
  },
  namespace: '/swap',
})
export class SwapGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(SwapGateway.name);
  private readonly connectedClients = new Map<string, Set<string>>(); // userId -> Set of socketIds

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  /**
   * Handle client connection
   * Authenticate via JWT token from handshake auth
   */
  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token || client.handshake.headers?.authorization?.replace('Bearer ', '');
      
      if (!token) {
        this.logger.warn(`Client ${client.id} disconnected: No token provided`);
        client.disconnect();
        return;
      }

      const secret = this.configService.get<string>('JWT_SECRET');
      const payload = this.jwtService.verify(token, { secret });
      const userId = payload.userId;

      // Store connection
      if (!this.connectedClients.has(userId)) {
        this.connectedClients.set(userId, new Set());
      }
      this.connectedClients.get(userId)!.add(client.id);
      (client as any).userId = userId;

      this.logger.log(`Client ${client.id} connected (userId: ${userId})`);
      
      client.emit('connected', { message: 'Connected to swap notifications' });
    } catch (error) {
      this.logger.warn(`Client ${client.id} authentication failed: ${error.message}`);
      client.disconnect();
    }
  }

  /**
   * Handle client disconnection
   */
  handleDisconnect(client: Socket) {
    const userId = (client as any).userId;
    if (userId && this.connectedClients.has(userId)) {
      this.connectedClients.get(userId)!.delete(client.id);
      if (this.connectedClients.get(userId)!.size === 0) {
        this.connectedClients.delete(userId);
      }
    }
    this.logger.log(`Client ${client.id} disconnected`);
  }

  /**
   * Subscribe to transaction updates by reference
   */
  @SubscribeMessage('subscribe')
  handleSubscribe(
    @MessageBody() data: { reference: string },
    @ConnectedSocket() client: Socket,
  ) {
    const userId = (client as any).userId;
    if (!userId) {
      client.emit('error', { message: 'Not authenticated' });
      return;
    }

    if (!data.reference) {
      client.emit('error', { message: 'Reference is required' });
      return;
    }

    // Join room for this transaction reference
    client.join(`transaction:${data.reference}`);
    this.logger.log(`Client ${client.id} subscribed to transaction ${data.reference}`);
    
    client.emit('subscribed', { reference: data.reference });
  }

  /**
   * Unsubscribe from transaction updates
   */
  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @MessageBody() data: { reference: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (data.reference) {
      client.leave(`transaction:${data.reference}`);
      this.logger.log(`Client ${client.id} unsubscribed from transaction ${data.reference}`);
    }
  }

  /**
   * Emit transaction update to all clients subscribed to the transaction
   */
  emitTransactionUpdate(reference: string, data: any) {
    this.server.to(`transaction:${reference}`).emit('transaction_update', {
      reference,
      ...data,
      timestamp: new Date().toISOString(),
    });
    this.logger.log(`Emitted transaction update for ${reference}`);
  }

  /**
   * Emit transaction update to specific user
   */
  emitToUser(userId: string, event: string, data: any) {
    const userSockets = this.connectedClients.get(userId);
    if (userSockets) {
      userSockets.forEach((socketId) => {
        this.server.to(socketId).emit(event, data);
      });
    }
  }
}

