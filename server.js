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
      // Use a transaction to prevent race conditions
      const result = await prisma.$transaction(async (tx) => {
        // First, check if the chat is still available for assignment
        const chat = await tx.chat.findUnique({
          where: { id: chatId },
          select: { adminId: true, status: true }
        });

        if (!chat) {
          throw new Error("Chat not found");
        }

        // If chat is already assigned to another admin, throw an error
        if (chat.adminId && chat.adminId !== adminId) {
          throw new Error("Chat was already assigned to another admin");
        }

        // If chat is already assigned to this admin and active, no need to update
        if (chat.adminId === adminId && chat.status === "ACTIVE") {
          return { updated: false, chat };
        }

        // Update the chat with the new admin assignment
        const updatedChat = await tx.chat.update({
          where: { id: chatId },
          data: {
            adminId,
            status: "ACTIVE",
            updatedAt: new Date(),
          }
        });

        // Update admin's last seen timestamp
        await tx.admin.update({
          where: { id: adminId },
          data: {
            lastSeenAt: new Date(),
          }
        });

        return { updated: true, chat: updatedChat };
      });

      return result;
    } catch (error) {
      console.error("Error assigning admin to chat:", error);
      throw error; // Re-throw to handle in the calling function
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
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
  
  const pendingChats = await prisma.chat.findMany({
    where: { 
      status: 'PENDING', 
      isActive: true,
      createdAt: {
        lt: fiveMinutesAgo // Only auto-assign chats that have been pending for more than 5 minutes
      }
    },
    include: {
      user: { select: { name: true, email: true } },
      admin: { select: { name: true, email: true } },
    }
  });
  
  console.log(`🔄 Checking ${pendingChats.length} long-pending chats for auto-assignment`);
  
  for (const chat of pendingChats) {
    const availableAdmin = await AdminAllocationService.findAvailableAdmin(chat.chatType);
    if (availableAdmin) {
      try {
        await AdminAllocationService.assignAdminToChat(chat.id, availableAdmin.id);
        
        // Notify admin
        const adminSocketIds = Array.from(adminSessions.entries())
          .filter(([_, adminId]) => adminId === availableAdmin.id)
          .map(([socketId, _]) => socketId);
        adminSocketIds.forEach(adminSocketId => {
          // First add the chat to the admin's list
          io.to(adminSocketId).emit("new_chat_request", {
            chatId: chat.id,
            roomId: chat.socketIORoomId,
            chatType: chat.chatType,
            chatName: chat.chatName,
            userName: chat.user?.name,
            userEmail: chat.user?.email,
            createdAt: chat.createdAt,
            updatedAt: chat.updatedAt,
            lastMessageAt: chat.lastMessageAt,
          });
          
          // Then immediately confirm the assignment (with a small delay to ensure proper ordering)
          setTimeout(() => {
            io.to(adminSocketId).emit("admin_joined_confirmation", {
              chatId: chat.id,
              status: "ACTIVE",
              adminName: availableAdmin.name,
            });
          }, 100);
        });
        
        // Notify user
        io.to(chat.socketIORoomId).emit("admin_joined", {
          chatId: chat.id,
          adminName: availableAdmin.name,
        });
        
        // Broadcast to all other admins that this chat is no longer pending
        const allAdminSocketIds = Array.from(adminSessions.keys());
        allAdminSocketIds.forEach(adminSocketId => {
          if (!adminSocketIds.includes(adminSocketId)) { // Don't send to the assigned admin
            io.to(adminSocketId).emit("chat_assigned", {
              chatId: chat.id,
              assignedAdminId: availableAdmin.id,
              assignedAdminName: availableAdmin.name,
              status: "ACTIVE"
            });
          }
        });
        
        console.log(`✅ Long-pending chat ${chat.id} auto-assigned to admin ${availableAdmin.name}`);
      } catch (assignmentError) {
        if (assignmentError.message === "Chat was already assigned to another admin") {
          console.log(`⏳ Chat ${chat.id} was already assigned to another admin during auto-assignment`);
        } else {
          console.error(`❌ Error auto-assigning chat ${chat.id}:`, assignmentError);
        }
      }
    } else {
      console.log(`⏳ No available admin for long-pending chat ${chat.id}`);
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
              adminId: adminId, // Only get chats assigned to THIS admin
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

          // Also get all pending chats that the admin can potentially pick up
          const pendingChats = await prisma.chat.findMany({
            where: {
              status: 'PENDING',
              isActive: true
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

          const allChats = [...existingChats, ...pendingChats];

          if (allChats.length > 0) {
            console.log(`🔄 Admin ${admin.name} has ${existingChats.length} existing chats and ${pendingChats.length} pending chats available`);
            
            // Rejoin all existing chat rooms (only for assigned chats)
            for (const chat of existingChats) {
              // Double-check that the chat is still assigned to this admin
              const currentChat = await prisma.chat.findUnique({
                where: { id: chat.id },
                select: { adminId: true, status: true }
              });
              
              if (currentChat && currentChat.adminId === adminId && currentChat.status === 'ACTIVE') {
                socket.join(chat.socketIORoomId);
                
                // Update room participants tracking
                const participants = roomParticipants.get(chat.socketIORoomId) || new Set();
                participants.add(socket.id);
                roomParticipants.set(chat.socketIORoomId, participants);
                
                console.log(`✅ Admin ${adminId} rejoined chat room: ${chat.socketIORoomId}`);
              } else {
                console.log(`⚠️ Admin ${adminId} tried to rejoin chat ${chat.id} but it's no longer assigned to them (current adminId: ${currentChat?.adminId}, status: ${currentChat?.status})`);
              }
            }

            // Send all chats to admin (both existing and pending)
            socket.emit("existing_admin_chats", {
              chats: allChats.map(chat => ({
                id: chat.id,
                chatName: chat.chatName,
                chatType: chat.chatType,
                status: chat.status,
                roomId: chat.socketIORoomId,
                userName: chat.user?.name,
                userEmail: chat.user?.email,
                lastMessageAt: chat.lastMessageAt,
                adminId: chat.adminId,
                admin: chat.admin
              }))
            });
          }
          
          console.log(`👨‍💼 Admin '${admin.name}' authenticated: ${socket.id}`);

          // Removed automatic allocation - admins will manually pick up pending chats
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
          
          console.log(`🔍 DEBUG: get_chat_history called for chat ${chatId} - userId: ${userId}, adminId: ${adminId}`);
          
          if (!userId && !adminId) {
            console.log(`❌ DEBUG: Not authenticated for get_chat_history`);
            socket.emit("error", { message: "Not authenticated" });
            return;
          }

          const chat = await ChatService.getChatWithMessages(chatId);
          if (!chat) {
            console.log(`❌ DEBUG: Chat ${chatId} not found in get_chat_history`);
            socket.emit("error", { message: "Chat not found" });
            return;
          }

          console.log(`🔍 DEBUG: Chat ${chatId} found - userId: ${chat.userId}, adminId: ${chat.adminId}`);

          // Verify user has access to this chat
          if (userId && chat.userId !== userId) {
            console.log(`❌ DEBUG: User access denied for chat history - chat userId: ${chat.userId}, requesting userId: ${userId}`);
            socket.emit("error", { message: "Access denied" });
            return;
          }

          // For admins: only allow access to chats assigned to them
          if (adminId) {
            console.log(`🔍 DEBUG: Admin access check for chat history - chat adminId: ${chat.adminId}, requesting adminId: ${adminId}`);
            if (!chat.adminId) {
              console.log(`❌ DEBUG: Admin ${adminId} trying to access unassigned chat ${chatId} history`);
              // Remove admin from room if they shouldn't be there
              socket.leave(chat.socketIORoomId);
              console.log(`🚫 DEBUG: Removed admin ${adminId} from room ${chat.socketIORoomId}`);
              socket.emit("error", { 
                message: "You can only access chats that are assigned to you.",
                chatId: chatId 
              });
              return;
            }
            if (chat.adminId !== adminId) {
              console.log(`❌ DEBUG: Admin ${adminId} trying to access chat ${chatId} history assigned to ${chat.adminId}`);
              // Remove admin from room if they shouldn't be there
              socket.leave(chat.socketIORoomId);
              console.log(`🚫 DEBUG: Removed admin ${adminId} from room ${chat.socketIORoomId}`);
              socket.emit("error", { 
                message: "Access denied - this chat is assigned to another admin.",
                chatId: chatId 
              });
              return;
            }
            console.log(`✅ DEBUG: Admin ${adminId} authorized to access chat ${chatId} history`);
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
          
          console.log(`🔍 DEBUG: join_existing_chat called for chat ${chatId} - userId: ${userId}, adminId: ${adminId}`);
          
          if (!userId && !adminId) {
            console.log(`❌ DEBUG: Not authenticated for join_existing_chat`);
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
            console.log(`❌ DEBUG: Chat ${chatId} not found in join_existing_chat`);
            socket.emit("error", { message: "Chat not found" });
            return;
          }

          console.log(`🔍 DEBUG: Chat ${chatId} found - userId: ${chat.userId}, adminId: ${chat.adminId}`);

          // Verify access
          if (userId && chat.userId !== userId) {
            console.log(`❌ DEBUG: User access denied - chat userId: ${chat.userId}, requesting userId: ${userId}`);
            socket.emit("error", { message: "Access denied" });
            return;
          }

          // For admins: only allow joining chats that are assigned to them
          if (adminId) {
            console.log(`🔍 DEBUG: Admin access check - chat adminId: ${chat.adminId}, requesting adminId: ${adminId}`);
            if (!chat.adminId) {
              console.log(`❌ DEBUG: Admin ${adminId} trying to join unassigned chat ${chatId}`);
              socket.emit("error", { 
                message: "You can only join chats that are assigned to you. Use 'Join' button to claim pending chats.",
                chatId: chatId 
              });
              return;
            }
            if (chat.adminId !== adminId) {
              console.log(`❌ DEBUG: Admin ${adminId} trying to join chat ${chatId} assigned to ${chat.adminId}`);
              socket.emit("error", { 
                message: "Access denied - this chat is assigned to another admin.",
                chatId: chatId 
              });
              return;
            }
            console.log(`✅ DEBUG: Admin ${adminId} authorized to join chat ${chatId}`);
          }

          // Join the room
          console.log(`🔍 DEBUG: Joining room ${chat.socketIORoomId} for chat ${chatId}`);
          socket.join(chat.socketIORoomId);
          const participants = roomParticipants.get(chat.socketIORoomId) || new Set();
          participants.add(socket.id);
          roomParticipants.set(chat.socketIORoomId, participants);
          console.log(`✅ DEBUG: Successfully joined room ${chat.socketIORoomId}`);

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

          // Notify all online admins about the new pending chat
          const adminSocketIds = Array.from(adminSessions.keys());
          adminSocketIds.forEach(adminSocketId => {
            io.to(adminSocketId).emit("new_chat_request", {
              chatId: chat.id,
              roomId: chat.socketIORoomId,
              chatType,
              chatName,
              userName: chat.user.name,
              userEmail: chat.user.email,
            });
          });

          socket.emit("chat_started", {
            chatId: chat.id,
            roomId: chat.socketIORoomId,
            chatName: chat.chatName,
            chatType: chat.chatType,
            status: "PENDING"
          });

          console.log(`💬 Chat started: ${chat.id} - Waiting for admin to pick up`);
        } catch (error) {
          console.error("Error starting chat:", error);
          socket.emit("error", { message: "Failed to start chat" });
        }
      });

      // Admin joins chat
      socket.on("admin_join_chat", async ({ chatId }) => {
        try {
          const adminId = adminSessions.get(socket.id);
          console.log(`🔍 DEBUG: admin_join_chat called for chat ${chatId} by admin ${adminId}`);
          
          if (!adminId) {
            console.log(`❌ DEBUG: Admin not authenticated for admin_join_chat`);
            socket.emit("error", { message: "Admin not authenticated" });
            return;
          }

          const chat = await ChatService.getChatWithMessages(chatId);
          if (!chat) {
            console.log(`❌ DEBUG: Chat ${chatId} not found`);
            socket.emit("error", { message: "Chat not found" });
            return;
          }

          console.log(`🔍 DEBUG: Chat ${chatId} found - adminId: ${chat.adminId}, requesting admin: ${adminId}`);

          // Check if chat is already assigned to another admin BEFORE joining
          if (chat.adminId && chat.adminId !== adminId) {
            console.log(`❌ DEBUG: Chat ${chatId} already assigned to ${chat.adminId}, not ${adminId}`);
            socket.emit("error", { 
              message: "Chat was already assigned to another admin.",
              chatId: chatId 
            });
            return;
          }

          // Try to assign admin to chat using transactional approach FIRST
          let assignmentResult;
          try {
            console.log(`🔍 DEBUG: Attempting to assign admin ${adminId} to chat ${chatId}`);
            assignmentResult = await AdminAllocationService.assignAdminToChat(chatId, adminId);
            console.log(`✅ DEBUG: Successfully assigned admin ${adminId} to chat ${chatId}`);
          } catch (assignmentError) {
            console.log(`❌ DEBUG: Assignment failed for chat ${chatId}: ${assignmentError.message}`);
            if (assignmentError.message === "Chat was already assigned to another admin") {
              // Remove admin from room if they somehow got in
              socket.leave(chat.socketIORoomId);
              console.log(`🚫 DEBUG: Removed admin ${adminId} from room ${chat.socketIORoomId} after failed assignment`);
              socket.emit("error", { 
                message: "Chat was already assigned to another admin.",
                chatId: chatId 
              });
              return;
            }
            throw assignmentError; // Re-throw other errors
          }

          // Only join the room AFTER successful assignment
          console.log(`🔍 DEBUG: Joining room ${chat.socketIORoomId} for chat ${chatId}`);
          socket.join(chat.socketIORoomId);
          const participants = roomParticipants.get(chat.socketIORoomId) || new Set();
          participants.add(socket.id);
          roomParticipants.set(chat.socketIORoomId, participants);
          console.log(`✅ DEBUG: Successfully joined room ${chat.socketIORoomId}`);

          // Notify user that admin has joined
          socket.to(chat.socketIORoomId).emit("admin_joined", {
            chatId,
            adminName: chat.admin?.name || "Admin",
          });

          // Notify the admin that they successfully joined
          socket.emit("admin_joined_confirmation", {
            chatId,
            status: "ACTIVE",
            adminName: chat.admin?.name || "Admin",
          });

          // Broadcast to all admins that this chat is no longer pending
          const allAdminSocketIds = Array.from(adminSessions.keys());
          allAdminSocketIds.forEach(adminSocketId => {
            if (adminSocketId !== socket.id) { // Don't send to the admin who joined
              io.to(adminSocketId).emit("chat_assigned", {
                chatId,
                assignedAdminId: adminId,
                assignedAdminName: chat.admin?.name || "Admin",
                status: "ACTIVE"
              });
            }
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

    // Periodic allocation (failsafe for long-pending chats)
    setInterval(async () => {
      try {
        await allocatePendingChats();
      } catch (e) {
        console.error('Error in periodic pending chat allocation:', e);
      }
    }, 120000); // every 2 minutes (instead of 30 seconds)

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