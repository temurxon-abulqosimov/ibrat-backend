let io;

// Setup socket handlers
const setupSocketHandlers = (socketIo) => {
  io = socketIo;
  
  io.on('connection', (socket) => {
    console.log(`🔌 New client connected: ${socket.id}`);
    
    // Handle user authentication
    socket.on('authenticate', async (data) => {
      try {
        const { token } = data;
        
        if (!token) {
          socket.emit('auth_error', { message: 'Authentication token required' });
          return;
        }

        // Verify JWT token
        const jwt = require('jsonwebtoken');
        const User = require('../models/User');
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId).select('-password');
        
        if (!user || !user.isActive) {
          socket.emit('auth_error', { message: 'Invalid or expired token' });
          return;
        }

        // Join user to appropriate rooms
        socket.userId = user._id;
        socket.userRole = user.role;
        socket.userName = user.name;
        
        // Join general room
        socket.join('general');
        
        // Join role-specific room
        socket.join(user.role);
        
        // Join user's personal room for private messages
        socket.join(`user_${user._id}`);
        
        // Emit authentication success
        socket.emit('authenticated', {
          userId: user._id,
          role: user.role,
          name: user.name
        });
        
        // Notify others that user is online
        socket.broadcast.to('general').emit('user_online', {
          userId: user._id,
          name: user.name,
          role: user.role
        });
        
        console.log(`✅ User ${user.name} (${user.role}) authenticated via socket`);
        
      } catch (error) {
        console.error('Socket authentication error:', error);
        socket.emit('auth_error', { message: 'Authentication failed' });
      }
    });

    // Handle user joining specific rooms
    socket.on('join_room', (roomName) => {
      if (socket.userId) {
        socket.join(roomName);
        console.log(`🔗 User ${socket.userName} joined room: ${roomName}`);
      }
    });

    // Handle user leaving rooms
    socket.on('leave_room', (roomName) => {
      if (socket.userId) {
        socket.leave(roomName);
        console.log(`🔌 User ${socket.userName} left room: ${roomName}`);
      }
    });

    // Handle availability updates
    socket.on('update_availability', async (data) => {
      try {
        if (!socket.userId) {
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        const { isAvailable } = data;
        const User = require('../models/User');
        
        await User.findByIdAndUpdate(socket.userId, { isAvailable });
        
        // Broadcast availability change
        socket.broadcast.to('general').emit('user_availability_changed', {
          userId: socket.userId,
          isAvailable,
          name: socket.userName
        });
        
        console.log(`📱 User ${socket.userName} availability updated: ${isAvailable}`);
        
      } catch (error) {
        console.error('Error updating availability:', error);
        socket.emit('error', { message: 'Failed to update availability' });
      }
    });

    // Handle manual call initiation
    socket.on('initiate_call', async (data) => {
      try {
        if (!socket.userId) {
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        const { leadId } = data;
        
        // Emit to all clients that a call is being initiated
        io.emit('call_being_initiated', {
          leadId,
          initiatedBy: socket.userId,
          timestamp: new Date()
        });
        
        console.log(`📞 User ${socket.userName} initiated call for lead: ${leadId}`);
        
      } catch (error) {
        console.error('Error initiating call:', error);
        socket.emit('error', { message: 'Failed to initiate call' });
      }
    });

    // Handle call notes updates
    socket.on('update_call_notes', async (data) => {
      try {
        if (!socket.userId) {
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        const { callId, notes } = data;
        
        // Update call log with notes
        const CallLog = require('../models/CallLog');
        await CallLog.findByIdAndUpdate(callId, { notes });
        
        // Broadcast notes update
        io.emit('call_notes_updated', {
          callId,
          notes,
          updatedBy: socket.userId,
          timestamp: new Date()
        });
        
        console.log(`📝 User ${socket.userName} updated notes for call: ${callId}`);
        
      } catch (error) {
        console.error('Error updating call notes:', error);
        socket.emit('error', { message: 'Failed to update call notes' });
      }
    });

    // Handle user typing indicators
    socket.on('typing_start', (data) => {
      if (socket.userId) {
        socket.broadcast.to('general').emit('user_typing', {
          userId: socket.userId,
          name: socket.userName,
          isTyping: true
        });
      }
    });

    socket.on('typing_stop', (data) => {
      if (socket.userId) {
        socket.broadcast.to('general').emit('user_typing', {
          userId: socket.userId,
          name: socket.userName,
          isTyping: false
        });
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      if (socket.userId) {
        console.log(`🔌 User ${socket.userName} disconnected: ${socket.id}`);
        
        // Notify others that user is offline
        socket.broadcast.to('general').emit('user_offline', {
          userId: socket.userId,
          name: socket.userName,
          role: socket.userRole
        });
      } else {
        console.log(`🔌 Anonymous client disconnected: ${socket.id}`);
      }
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  });

  console.log('✅ Socket.io handlers setup completed');
};

// Emit call updates to all connected clients
const emitCallUpdate = (event, data) => {
  if (io) {
    io.emit(event, {
      ...data,
      timestamp: new Date()
    });
    console.log(`📡 Emitted ${event} event:`, data);
  } else {
    console.warn('⚠️ Socket.io not initialized, cannot emit event');
  }
};

// Emit to specific room
const emitToRoom = (room, event, data) => {
  if (io) {
    io.to(room).emit(event, {
      ...data,
      timestamp: new Date()
    });
    console.log(`📡 Emitted ${event} to room ${room}:`, data);
  } else {
    console.warn('⚠️ Socket.io not initialized, cannot emit event');
  }
};

// Emit to specific user
const emitToUser = (userId, event, data) => {
  if (io) {
    io.to(`user_${userId}`).emit(event, {
      ...data,
      timestamp: new Date()
    });
    console.log(`📡 Emitted ${event} to user ${userId}:`, data);
  } else {
    console.warn('⚠️ Socket.io not initialized, cannot emit event');
  }
};

// Broadcast to all clients except sender
const broadcastToAll = (event, data, excludeSocketId = null) => {
  if (io) {
    if (excludeSocketId) {
      io.except(excludeSocketId).emit(event, {
        ...data,
        timestamp: new Date()
      });
    } else {
      io.emit(event, {
        ...data,
        timestamp: new Date()
      });
    }
    console.log(`📡 Broadcasted ${event} event:`, data);
  } else {
    console.warn('⚠️ Socket.io not initialized, cannot broadcast event');
  }
};

// Get connected users count
const getConnectedUsersCount = () => {
  if (io) {
    return io.engine.clientsCount;
  }
  return 0;
};

// Get connected users info
const getConnectedUsers = () => {
  if (!io) return [];
  
  const users = [];
  const rooms = io.sockets.adapter.rooms;
  
  // Get all connected sockets
  for (const [socketId, socket] of io.sockets.sockets) {
    if (socket.userId) {
      users.push({
        socketId,
        userId: socket.userId,
        name: socket.userName,
        role: socket.userRole,
        connectedAt: socket.handshake.time
      });
    }
  }
  
  return users;
};

// Force disconnect user
const disconnectUser = (userId) => {
  if (io) {
    const userSockets = io.sockets.sockets;
    
    for (const [socketId, socket] of userSockets) {
      if (socket.userId === userId) {
        socket.disconnect(true);
        console.log(`🔌 Forced disconnect for user: ${userId}`);
      }
    }
  }
};

module.exports = {
  setupSocketHandlers,
  emitCallUpdate,
  emitToRoom,
  emitToUser,
  broadcastToAll,
  getConnectedUsersCount,
  getConnectedUsers,
  disconnectUser
}; 