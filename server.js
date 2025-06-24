const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { createClient } = require("redis");
const { createAdapter } = require("@socket.io/redis-adapter");
const { PrismaClient } = require("@prisma/client");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { 
    origin: process.env.NODE_ENV === "production" 
      ? ["https://yourdomain.com"] 
      : ["http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000", "http://127.0.0.1:3001"],
    credentials: true 
  },
  transports: ["websocket", "polling"],
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Initialize Prisma
const prisma = new PrismaClient();

// Redis setup for horizontal scaling
const pubClient = createClient({ 
  url: process.env.REDIS_URL || "redis://localhost:6379",
  retry_strategy: (options) => {
    if (options.error && options.error.code === 'ECONNREFUSED') {
      return new Error('The server refused the connection');
    }
    if (options.total_retry_time > 1000 * 60 * 60) {
      return new Error('Retry time exhausted');
    }
    if (options.attempt > 10) {
      return undefined;
    }
    return Math.min(options.attempt * 100, 3000);
  }
});
const subClient = pubClient.duplicate();

// In-memory tracking for performance
const adminSessions = new Map(); // socketId -> adminId
const userSessions = new Map(); // socketId -> userId
const roomParticipants = new Map(); // roomId -> Set of socketIds

// Admin allocation strategy
class AdminAllocationService {
  static async findAvailableAdmin(chatType) {
    try {
      // Find online admins with available capacity
      const availableAdmins = await prisma.admin.findMany({
        where: {
          isOnline: true,
          isActive: true,
        },
        include: {
          _count: {
            select: {
              chats: {
                where: {
                  status: "ACTIVE",
                  isActive: true,
                }
              }
            }
          }
        }
      });

      // Filter admins with capacity and sort by load
      const eligibleAdmins = availableAdmins
        .filter(admin => admin._count.chats < admin.maxChats)
        .sort((a, b) => a._count.chats - b._count.chats);

      if (eligibleAdmins.length === 0) {
        return null;
      }

      // For now, return the least loaded admin
      // In the future, you can implement more sophisticated allocation
      return eligibleAdmins[0];
    } catch (error) {
      console.error("Error finding available admin:", error);
      return null;
    }
  }

  static async assignAdminToChat(chatId, adminId) {
    try {
      await prisma.chat.update({
        where: { id: chatId },
        data: {
          adminId,
          status: "ACTIVE",
          updatedAt: new Date(),
        }
      });

      await prisma.admin.update({
        where: { id: adminId },
        data: {
          lastSeenAt: new Date(),
        }
      });

      return true;
    } catch (error) {
      console.error("Error assigning admin to chat:", error);
      return false;
    }
  }
}

// Chat management service
class ChatService {
  static async createChat(userId, chatType, chatName) {
    try {
      const socketIORoomId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const chat = await prisma.chat.create({
        data: {
          userId,
          chatType,
          chatName,
          socketIORoomId,
          status: "PENDING",
        },
        include: {
          user: {
            select: {
              name: true,
              email: true,
            }
          }
        }
      });

      return chat;
    } catch (error) {
      console.error("Error creating chat:", error);
      throw error;
    }
  }

  static async saveMessage(chatId, senderId, content, isAdmin) {
    try {
      const message = await prisma.message.create({
        data: {
          chatId,
          senderId,
          content,
          isAdmin,
        }
      });

      // Update chat's last message timestamp
      await prisma.chat.update({
        where: { id: chatId },
        data: {
          lastMessageAt: new Date(),
        }
      });

      return message;
    } catch (error) {
      console.error("Error saving message:", error);
      throw error;
    }
  }

  static async getChatWithMessages(chatId) {
    try {
      return await prisma.chat.findUnique({
        where: { id: chatId },
        include: {
          messages: {
            orderBy: { createdAt: "asc" }
          },
          user: {
            select: {
              name: true,
              email: true,
            }
          },
          admin: {
            select: {
              name: true,
              email: true,
            }
          }
        }
      });
    } catch (error) {
      console.error("Error getting chat:", error);
      throw error;
    }
  }
}

// Notification service for offline admins
class NotificationService {
  static async notifyOfflineAdmins(chat) {
    try {
      // Get all online admins
      const onlineAdmins = await prisma.admin.findMany({
        where: {
          isOnline: true,
          isActive: true,
        }
      });

      // If no admins are online, you can implement:
      // 1. Email notifications
      // 2. Push notifications
      // 3. SMS notifications
      // 4. Store in a queue for when admins come online

      console.log(`📧 No online admins available for chat ${chat.id}. Consider implementing notification system.`);
      
      // For now, we'll just log it. In production, you'd:
      // - Send email to all admins
      // - Store in a notification queue
      // - Implement webhook notifications
      
      return true;
    } catch (error) {
      console.error("Error notifying offline admins:", error);
      return false;
    }
  }
}

// Helper: Allocate pending chats to available admins
async function allocatePendingChats() {
  const pendingChats = await prisma.chat.findMany({
    where: { status: 'PENDING', isActive: true },
    include: {
      user: { select: { name: true, email: true } },
      admin: { select: { name: true, email: true } },
    }
  });
  for (const chat of pendingChats) {
    const availableAdmin = await AdminAllocationService.findAvailableAdmin(chat.chatType);
    if (availableAdmin) {
      await AdminAllocationService.assignAdminToChat(chat.id, availableAdmin.id);
      // Notify admin
      const adminSocketIds = Array.from(adminSessions.entries())
        .filter(([_, adminId]) => adminId === availableAdmin.id)
        .map(([socketId, _]) => socketId);
      adminSocketIds.forEach(adminSocketId => {
        io.to(adminSocketId).emit("new_chat_request", {
          chatId: chat.id,
          roomId: chat.socketIORoomId,
          chatType: chat.chatType,
          chatName: chat.chatName,
          userName: chat.user?.name,
          userEmail: chat.user?.email,
          createdAt: chat.createdAt,
        });
      });
      // Notify user
      io.to(chat.socketIORoomId).emit("admin_joined", {
        chatId: chat.id,
        adminName: availableAdmin.name,
      });
      console.log(`✅ Pending chat ${chat.id} assigned to admin ${availableAdmin.name}`);
    }
  }
}

async function init() {
  console.log("🚀 Initializing production-ready chat server...");
  
  try {
    // Connect to Redis
    await pubClient.connect();
    await subClient.connect();
    io.adapter(createAdapter(pubClient, subClient));
    console.log("✅ Redis adapter connected");

    // Test database connection
    await prisma.$connect();
    console.log("✅ Database connected");

    // Health check endpoint
    app.get("/health", (req, res) => {
      res.json({ 
        status: "healthy", 
        timestamp: new Date().toISOString(),
        connections: io.engine.clientsCount
      });
    });

    // Socket connection handling
    io.on("connection", (socket) => {
      console.log(`🔌 New connection: ${socket.id}`);

      // Admin authentication and session management
      socket.on("admin_authenticate", async ({ adminId, adminEmail }) => {
        try {
          const admin = await prisma.admin.findUnique({
            where: { id: adminId }
          });

          if (!admin || admin.email !== adminEmail) {
            socket.emit("auth_error", { message: "Invalid admin credentials" });
            return;
          }

          // Create admin session
          const session = await prisma.adminSession.create({
            data: {
              adminId,
              socketId: socket.id,
            }
          });

          // Update admin status
          await prisma.admin.update({
            where: { id: adminId },
            data: {
              isOnline: true,
              lastSeenAt: new Date(),
            }
          });

          adminSessions.set(socket.id, adminId);
          socket.emit("admin_authenticated", { adminId, adminName: admin.name });
          
          // Get admin's existing active chats
          const existingChats = await prisma.chat.findMany({
            where: {
              adminId,
              isActive: true,
              status: 'ACTIVE'
            },
            include: {
              user: {
                select: {
                  name: true,
                  email: true,
                }
              }
            }
          });

          if (existingChats.length > 0) {
            console.log(`🔄 Admin ${admin.name} has ${existingChats.length} existing chats`);
            
            // Rejoin all existing chat rooms
            for (const chat of existingChats) {
              socket.join(chat.socketIORoomId);
              
              // Update room participants tracking
              const participants = roomParticipants.get(chat.socketIORoomId) || new Set();
              participants.add(socket.id);
              roomParticipants.set(chat.socketIORoomId, participants);
              
              console.log(`✅ Admin rejoined chat room: ${chat.socketIORoomId}`);
            }

            // Send existing chats to admin
            socket.emit("existing_admin_chats", {
              chats: existingChats.map(chat => ({
                id: chat.id,
                chatName: chat.chatName,
                chatType: chat.chatType,
                status: chat.status,
                roomId: chat.socketIORoomId,
                userName: chat.user?.name,
                userEmail: chat.user?.email,
                lastMessageAt: chat.lastMessageAt,
              }))
            });
          }
          
          console.log(` Admin '${admin.name}' authenticated: ${socket.id}`);

          // After admin authenticates and is set online:
          await allocatePendingChats();
        } catch (error) {
          console.error("Admin authentication error:", error);
          socket.emit("auth_error", { message: "Authentication failed" });
        }
      });

      // User authentication
      socket.on("user_authenticate", async ({ supabaseUserId }) => {
        try {
          const user = await prisma.user.findUnique({
            where: { supabaseUserId: supabaseUserId },
            select: { 
              id: true,
              name: true,
            }
          });

          if (!user) {
            socket.emit("auth_error", { message: "Invalid user credentials" });
            return;
          }
          const userId = user.id;
          userSessions.set(socket.id, userId);
          socket.emit("user_authenticated", { userId, userName: user.name });
          
          // Get user's existing active chats and rejoin them
          const existingChats = await prisma.chat.findMany({
            where: {
              userId,
              isActive: true,
              status: {
                in: ['PENDING', 'ACTIVE', 'CLOSED']
              }
            },
            include: {
              admin: {
                select: {
                  name: true,
                  email: true,
                }
              }
            }
          });

          if (existingChats.length > 0) {
            console.log(`🔄 User ${user.name} has ${existingChats.length} existing chats`);
            
            // Rejoin all existing chat rooms
            for (const chat of existingChats) {
              socket.join(chat.socketIORoomId);
              
              // Update room participants tracking
              const participants = roomParticipants.get(chat.socketIORoomId) || new Set();
              participants.add(socket.id);
              roomParticipants.set(chat.socketIORoomId, participants);
              
              console.log(`✅ User rejoined chat room: ${chat.socketIORoomId}`);
            }

            // Send existing chats to user
            socket.emit("existing_chats", {
              chats: existingChats.map(chat => ({
                id: chat.id,
                chatName: chat.chatName,
                chatType: chat.chatType,
                status: chat.status,
                roomId: chat.socketIORoomId,
                adminName: chat.admin?.name,
                lastMessageAt: chat.lastMessageAt,
              }))
            });
          }
          
          console.log(`👤 User '${user.name}' authenticated: ${socket.id}`);
        } catch (error) {
          console.error("User authentication error:", error);
          socket.emit("auth_error", { message: "Authentication failed" });
        }
      });

      // Get chat history for existing chat
      socket.on("get_chat_history", async ({ chatId }) => {
        try {
          const userId = userSessions.get(socket.id);
          const adminId = adminSessions.get(socket.id);
          
          if (!userId && !adminId) {
            socket.emit("error", { message: "Not authenticated" });
            return;
          }

          const chat = await ChatService.getChatWithMessages(chatId);
          if (!chat) {
            socket.emit("error", { message: "Chat not found" });
            return;
          }

          // Verify user has access to this chat
          if (userId && chat.userId !== userId) {
            socket.emit("error", { message: "Access denied" });
            return;
          }

          if (adminId && chat.adminId !== adminId) {
            socket.emit("error", { message: "Access denied" });
            return;
          }

          socket.emit("chat_history", {
            chatId,
            messages: chat.messages,
            user: chat.user,
            admin: chat.admin,
            chatType: chat.chatType,
            status: chat.status,
          });

          console.log(`📜 Chat history sent for ${chatId}`);
        } catch (error) {
          console.error("Error getting chat history:", error);
          socket.emit("error", { message: "Failed to get chat history" });
        }
      });

      // Join existing chat (for users returning to a specific chat)
      socket.on("join_existing_chat", async ({ chatId }) => {
        try {
          const userId = userSessions.get(socket.id);
          const adminId = adminSessions.get(socket.id);
          
          if (!userId && !adminId) {
            socket.emit("error", { message: "Not authenticated" });
            return;
          }

          const chat = await prisma.chat.findUnique({
            where: { id: chatId },
            include: {
              user: {
                select: {
                  name: true,
                  email: true,
                }
              },
              admin: {
                select: {
                  name: true,
                  email: true,
                }
              }
            }
          });

          if (!chat) {
            socket.emit("error", { message: "Chat not found" });
            return;
          }

          // Verify access
          if (userId && chat.userId !== userId) {
            socket.emit("error", { message: "Access denied" });
            return;
          }

          if (adminId && chat.adminId !== adminId) {
            socket.emit("error", { message: "Access denied" });
            return;
          }

          // Join the room
          socket.join(chat.socketIORoomId);
          const participants = roomParticipants.get(chat.socketIORoomId) || new Set();
          participants.add(socket.id);
          roomParticipants.set(chat.socketIORoomId, participants);

          // Notify other participants that user joined
          socket.to(chat.socketIORoomId).emit("user_joined_chat", {
            chatId,
            userName: userId ? chat.user?.name : chat.admin?.name,
            isAdmin: !!adminId,
          });

          console.log(`✅ User joined existing chat: ${chatId}`);
        } catch (error) {
          console.error("Error joining existing chat:", error);
          socket.emit("error", { message: "Failed to join chat" });
        }
      });

      // Start new chat
      socket.on("start_chat", async ({ chatType, chatName }) => {
        try {
          const userId = userSessions.get(socket.id);
          if (!userId) {
            socket.emit("error", { message: "User not authenticated" });
            return;
          }

          // Create chat
          const chat = await ChatService.createChat(userId, chatType, chatName);
          
          // Join the room
          socket.join(chat.socketIORoomId);
          roomParticipants.set(chat.socketIORoomId, new Set([socket.id]));

          // Try to find available admin
          const availableAdmin = await AdminAllocationService.findAvailableAdmin(chatType);
          
          if (availableAdmin) {
            // Assign admin and notify
            await AdminAllocationService.assignAdminToChat(chat.id, availableAdmin.id);
            
            // Notify admin about new chat
            const adminSocketIds = Array.from(adminSessions.entries())
              .filter(([_, adminId]) => adminId === availableAdmin.id)
              .map(([socketId, _]) => socketId);

            adminSocketIds.forEach(adminSocketId => {
              io.to(adminSocketId).emit("new_chat_request", {
                chatId: chat.id,
                roomId: chat.socketIORoomId,
                chatType,
                chatName,
                userName: chat.user.name,
                userEmail: chat.user.email,
                createdAt: chat.createdAt,
              });
            });

            socket.emit("chat_started", {
              chatId: chat.id,
              roomId: chat.socketIORoomId,
              chatName: chat.chatName,
              chatType: chat.chatType,
              status: "PENDING_ADMIN_JOIN"
            });

            console.log(`💬 Chat started: ${chat.id} - Admin assigned: ${availableAdmin.name}`);
          } else {
            // No admin available - notify offline admins
            await NotificationService.notifyOfflineAdmins(chat);

            socket.emit("chat_started", {
              chatId: chat.id,
              roomId: chat.socketIORoomId,
              chatName: chat.chatName,
              chatType: chat.chatType,
              status: "PENDING_ADMIN_AVAILABLE"
            });

            console.log(`⏳ Chat started: ${chat.id} - No admin available`);
          }
        } catch (error) {
          console.error("Error starting chat:", error);
          socket.emit("error", { message: "Failed to start chat" });
        }
      });

      // Admin joins chat
      socket.on("admin_join_chat", async ({ chatId }) => {
        try {
          const adminId = adminSessions.get(socket.id);
          if (!adminId) {
            socket.emit("error", { message: "Admin not authenticated" });
            return;
          }

          const chat = await ChatService.getChatWithMessages(chatId);
          if (!chat) {
            socket.emit("error", { message: "Chat not found" });
            return;
          }

          // Join the room
          socket.join(chat.socketIORoomId);
          const participants = roomParticipants.get(chat.socketIORoomId) || new Set();
          participants.add(socket.id);
          roomParticipants.set(chat.socketIORoomId, participants);

          // Update chat status if not already active
          if (chat.status !== "ACTIVE") {
            await AdminAllocationService.assignAdminToChat(chatId, adminId);
          }

          // Notify user that admin has joined
          socket.to(chat.socketIORoomId).emit("admin_joined", {
            chatId,
            adminName: chat.admin?.name || "Admin",
          });

          // Send chat history to admin
          socket.emit("chat_history", {
            chatId,
            messages: chat.messages,
            user: chat.user,
          });

          console.log(`👨‍💼 Admin joined chat: ${chatId}`);
        } catch (error) {
          console.error("Error admin joining chat:", error);
          socket.emit("error", { message: "Failed to join chat" });
        }
      });

      // Send message
      socket.on("send_message", async ({ chatId, content }) => {
        try {
          const userId = userSessions.get(socket.id);
          const adminId = adminSessions.get(socket.id);
          
          if (!userId && !adminId) {
            socket.emit("error", { message: "Not authenticated" });
            return;
          }

          const chat = await prisma.chat.findUnique({
            where: { id: chatId },
            include: { user: true, admin: true }
          });

          if (!chat) {
            socket.emit("error", { message: "Chat not found" });
            return;
          }

          const isAdmin = !!adminId;
          const senderId = isAdmin ? adminId : userId;

          // Save message to database
          const message = await ChatService.saveMessage(chatId, senderId, content, isAdmin);

          const messagePayload = {
            id: message.id,
            chatId,
            senderId,
            content,
            isAdmin,
            timestamp: message.createdAt,
            senderName: isAdmin ? chat.admin?.name : chat.user?.name,
          };

          // Broadcast to room
          io.to(chat.socketIORoomId).emit("new_message", messagePayload);

          console.log(`💬 Message sent in ${chatId}: ${content.substring(0, 50)}...`);
        } catch (error) {
          console.error("Error sending message:", error);
          socket.emit("error", { message: "Failed to send message" });
        }
      });

      // Typing indicators
      socket.on("start_typing", ({ chatId }) => {
        const roomId = `chat_${chatId}`;
        socket.to(roomId).emit("user_typing", { chatId });
      });

      socket.on("stop_typing", ({ chatId }) => {
        const roomId = `chat_${chatId}`;
        socket.to(roomId).emit("user_stopped_typing", { chatId });
      });

      // Mark message as read
      socket.on("mark_read", async ({ chatId, messageId }) => {
        try {
          await prisma.message.update({
            where: { id: messageId },
            data: { readAt: new Date() }
          });

          socket.to(`chat_${chatId}`).emit("message_read", { messageId });
        } catch (error) {
          console.error("Error marking message as read:", error);
        }
      });

      socket.on("get_pending_chats", async () => {
        try {
        const adminId = adminSessions.get(socket.id);
        if (!adminId) {
          socket.emit("error", { message: "Admin not authenticated" });
          return;
        }

        const pendingChats = await prisma.chat.findMany({
          where: { status: "PENDING" },
          include: { id: true, chatName: true, chatType: true, status: true, socketIORoomId: true, user: true, admin: true, createdAt: true }
          });
          socket.emit("pending_chats", pendingChats);
        } catch (error) {
          console.error("Error getting pending chats:", error);
          socket.emit("error", { message: "Failed to get pending chats" });
        }
      });

      // Admin closes chat
      socket.on("close_chat", async ({ chatId, reason }) => {
        try {
          const adminId = adminSessions.get(socket.id);
          if (!adminId) {
            socket.emit("error", { message: "Admin not authenticated" });
            return;
          }

          const chat = await prisma.chat.findUnique({
            where: { id: chatId },
            include: { user: true, admin: true }
          });

          if (!chat) {
            socket.emit("error", { message: "Chat not found" });
            return;
          }

          // Verify admin owns this chat
          if (chat.adminId !== adminId) {
            socket.emit("error", { message: "You can only close your own chats" });
            return;
          }

          // Update chat status to CLOSED
          await prisma.chat.update({
            where: { id: chatId },
            data: {
              status: "CLOSED",
              closedAt: new Date(),
              closedBy: adminId,
              closeReason: reason || "Chat closed by admin",
              updatedAt: new Date(),
            }
          });

          // Notify all participants in the room
          io.to(chat.socketIORoomId).emit("chat_closed", {
            chatId,
            closedBy: chat.admin?.name || "Admin",
            reason: reason || "Chat closed by admin",
            closedAt: new Date(),
          });

          // Remove participants from room tracking
          roomParticipants.delete(chat.socketIORoomId);

          console.log(`🔒 Chat ${chatId} closed by admin ${adminId}`);

          // After admin closes a chat:
          await allocatePendingChats();
        } catch (error) {
          console.error("Error closing chat:", error);
          socket.emit("error", { message: "Failed to close chat" });
        }
      });

      // Admin archives chat (optional - for cleanup)
      socket.on("archive_chat", async ({ chatId }) => {
        try {
          const adminId = adminSessions.get(socket.id);
          if (!adminId) {
            socket.emit("error", { message: "Admin not authenticated" });
            return;
          }

          const chat = await prisma.chat.findUnique({
            where: { id: chatId }
          });

          if (!chat) {
            socket.emit("error", { message: "Chat not found" });
            return;
          }

          // Only allow archiving closed chats
          if (chat.status !== "CLOSED") {
            socket.emit("error", { message: "Only closed chats can be archived" });
            return;
          }

          // Update chat status to ARCHIVED
          await prisma.chat.update({
            where: { id: chatId },
            data: {
              status: "ARCHIVED",
              archivedAt: new Date(),
              updatedAt: new Date(),
            }
          });

          socket.emit("chat_archived", { chatId });
          console.log(`📦 Chat ${chatId} archived by admin ${adminId}`);
        } catch (error) {
          console.error("Error archiving chat:", error);
          socket.emit("error", { message: "Failed to archive chat" });
        }
      });

      // User reopens a closed chat
      socket.on("reopen_chat", async ({ chatId }) => {
        try {
          const userId = userSessions.get(socket.id);
          if (!userId) {
            socket.emit("error", { message: "User not authenticated" });
            return;
          }

          const chat = await prisma.chat.findUnique({
            where: { id: chatId },
            include: {
              user: true,
              admin: true
            }
          });

          if (!chat) {
            socket.emit("error", { message: "Chat not found" });
            return;
          }

          // Verify user owns this chat
          if (chat.userId !== userId) {
            socket.emit("error", { message: "Access denied" });
            return;
          }

          // Only allow reopening closed chats
          if (chat.status !== "CLOSED") {
            socket.emit("error", { message: "Only closed chats can be reopened" });
            return;
          }

          // Check if original admin is available
          let assignedAdmin = null;
          let isReopened = false;

          if (chat.adminId) {
            const originalAdmin = await prisma.admin.findUnique({
              where: { id: chat.adminId },
              include: {
                _count: {
                  select: {
                    chats: {
                      where: {
                        status: "ACTIVE",
                        isActive: true,
                      }
                    }
                  }
                }
              }
            });

            // Check if original admin is online and has capacity
            if (originalAdmin && 
                originalAdmin.isOnline && 
                originalAdmin.isActive && 
                originalAdmin._count.chats < originalAdmin.maxChats) {
              assignedAdmin = originalAdmin;
              isReopened = true;
              console.log(`🔄 Reopening chat ${chatId} with original admin ${originalAdmin.name}`);
            }
          }

          // If original admin not available, find new admin
          if (!assignedAdmin) {
            assignedAdmin = await AdminAllocationService.findAvailableAdmin(chat.chatType);
            console.log(`🔄 Reopening chat ${chatId} with new admin ${assignedAdmin?.name || 'none available'}`);
          }

          // Update chat status
          const updateData = {
            status: assignedAdmin ? "ACTIVE" : "PENDING",
            closedAt: null,
            closedBy: null,
            closeReason: null,
            updatedAt: new Date(),
          };

          if (assignedAdmin) {
            updateData.adminId = assignedAdmin.id;
          }

          await prisma.chat.update({
            where: { id: chatId },
            data: updateData
          });

          // Join the room
          socket.join(chat.socketIORoomId);
          const participants = roomParticipants.get(chat.socketIORoomId) || new Set();
          participants.add(socket.id);
          roomParticipants.set(chat.socketIORoomId, participants);

          // Notify user about reopening
          socket.emit("chat_reopened", {
            chatId,
            status: assignedAdmin ? "ACTIVE" : "PENDING",
            adminName: assignedAdmin?.name,
            isReopened: isReopened,
            roomId: chat.socketIORoomId
          });

          if (assignedAdmin) {
            // Notify admin about reopened chat
            const adminSocketIds = Array.from(adminSessions.entries())
              .filter(([_, adminId]) => adminId === assignedAdmin.id)
              .map(([socketId, _]) => socketId);

            adminSocketIds.forEach(adminSocketId => {
              io.to(adminSocketId).emit("chat_reopened_admin", {
                chatId: chat.id,
                roomId: chat.socketIORoomId,
                chatType: chat.chatType,
                chatName: chat.chatName,
                userName: chat.user.name,
                userEmail: chat.user.email,
                isReopened: isReopened,
                originalAdminId: chat.adminId
              });
            });

            console.log(`✅ Chat ${chatId} reopened and assigned to admin ${assignedAdmin.name}`);
          } else {
            // No admin available - notify offline admins
            await NotificationService.notifyOfflineAdmins(chat);
            console.log(`⏳ Chat ${chatId} reopened but no admin available`);
          }

        } catch (error) {
          console.error("Error reopening chat:", error);
          socket.emit("error", { message: "Failed to reopen chat" });
        }
      });

      // Disconnect handling
      socket.on("disconnect", async () => {
        console.log(`🔌 Disconnected: ${socket.id}`);

        const adminId = adminSessions.get(socket.id);
        const userId = userSessions.get(socket.id);

        if (adminId) {
          // Handle admin disconnect
          try {
            await prisma.adminSession.updateMany({
              where: { socketId: socket.id },
              data: { isActive: false }
            });

            // Check if admin has other active sessions
            const activeSessions = await prisma.adminSession.count({
              where: {
                adminId,
                isActive: true,
              }
            });

            if (activeSessions === 0) {
              await prisma.admin.update({
                where: { id: adminId },
                data: {
                  isOnline: false,
                  lastSeenAt: new Date(),
                }
              });
              console.log(`👨‍💼 Admin ${adminId} went offline`);
            }

            adminSessions.delete(socket.id);
          } catch (error) {
            console.error("Error handling admin disconnect:", error);
          }
        }

        if (userId) {
          userSessions.delete(socket.id);
        }

        // Clean up room participants
        for (const [roomId, participants] of roomParticipants.entries()) {
          participants.delete(socket.id);
          if (participants.size === 0) {
            roomParticipants.delete(roomId);
          }
        }
      });
    });

    // Periodic allocation (failsafe)
    setInterval(async () => {
      try {
        await allocatePendingChats();
      } catch (e) {
        console.error('Error in periodic pending chat allocation:', e);
      }
    }, 30000); // every 30 seconds

    // Graceful shutdown
    process.on("SIGTERM", async () => {
      console.log("🛑 Received SIGTERM, shutting down gracefully...");
      await prisma.$disconnect();
      await pubClient.quit();
      await subClient.quit();
      server.close(() => {
        console.log("✅ Server closed");
        process.exit(0);
      });
    });

    process.on("SIGINT", async () => {
      console.log("🛑 Received SIGINT, shutting down gracefully...");
      await prisma.$disconnect();
      await pubClient.quit();
      await subClient.quit();
      server.close(() => {
        console.log("✅ Server closed");
        process.exit(0);
      });
    });

    // Start server
    const PORT = process.env.PORT || 3001;
    server.listen(PORT, () => {
      console.log(`🚀 Production chat server running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    });

  } catch (error) {
    console.error("❌ Server initialization failed:", error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

init().catch((err) => {
  console.error("❌ Server init error:", err);
  process.exit(1);
});