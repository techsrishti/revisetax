const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { createClient } = require("redis");
const { createAdapter } = require("@socket.io/redis-adapter");
const { PrismaClient } = require("@prisma/client");
const OpenAI = require("openai");

const app = express();
app.use(cors());
app.use(express.json());

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { 
    origin: process.env.NODE_ENV === "production" 
      ? [process.env.NEXT_PUBLIC_URL] 
      : ["http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000", "http://127.0.0.1:3001","http://18.60.99.199"],
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
      
      // Generate timestamp-based chat name if not provided
      const timestamp = new Date();
      const formattedDate = timestamp.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      });
      const formattedTime = timestamp.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      });
      
      const defaultChatName = `${chatType.replace(/([A-Z])/g, ' $1').trim()} - ${formattedDate} ${formattedTime}`;
      const finalChatName = chatName || defaultChatName;
      
      const chat = await prisma.chat.create({
        data: {
          userId,
          chatType,
          chatName: finalChatName,
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

  static async saveMessage(chatId, senderId, content, isAdmin, isBot = false) {
    try {
      const message = await prisma.message.create({
        data: {
          chatId,
          senderId,
          content,
          isAdmin,
          isBot,
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
      const chat = await prisma.chat.findUnique({
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

      if (chat) {
        // Add chat name to the response
        chat.chatName = chat.chatName || `${chat.chatType.replace(/([A-Z])/g, ' $1').trim()} - ${new Date(chat.createdAt).toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric', 
          year: 'numeric' 
        })} ${new Date(chat.createdAt).toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: true 
        })}`;
      }

      return chat;
    } catch (error) {
      console.error("Error getting chat:", error);
      throw error;
    }
  }

  static async updateChatName(chatId, newChatName) {
    try {
      const chat = await prisma.chat.update({
        where: { id: chatId },
        data: {
          chatName: newChatName,
          updatedAt: new Date(),
        },
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

      return chat;
    } catch (error) {
      console.error("Error updating chat name:", error);
      throw error;
    }
  }
}

// Simple Auto Response Context (minimal tracking)
class SimpleAutoResponse {
  static messageCount = new Map(); // chatId -> count of messages
  static lastUserMessages = new Map(); // chatId -> last user message

  static getMessageCount(chatId) {
    return this.messageCount.get(chatId) || 0;
  }

  static incrementMessageCount(chatId) {
    const count = this.getMessageCount(chatId) + 1;
    this.messageCount.set(chatId, count);
    return count;
  }

  static setLastMessage(chatId, message) {
    this.lastUserMessages.set(chatId, message);
  }

  static getLastMessage(chatId) {
    return this.lastUserMessages.get(chatId) || '';
  }

  static clearContext(chatId) {
    this.messageCount.delete(chatId);
    this.lastUserMessages.delete(chatId);
  }
}

// Intelligent Auto Response Service using ChatGPT
class SimpleAutoResponseService {
  static async generateSimpleResponse(chatId, userMessage, chatType, chatName, userProfile = null) {
    // Get conversation history for context
    const messageCount = SimpleAutoResponse.incrementMessageCount(chatId);
    
    // Store current user message for context
    if (userMessage) {
      SimpleAutoResponse.setLastMessage(chatId, userMessage);
    }
    
    try {
      // Get recent conversation context
      let conversationContext = "";
      try {
        const chat = await prisma.chat.findUnique({
          where: { id: chatId },
          include: {
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 10, // Last 10 messages for context
              select: {
                content: true,
                isAdmin: true,
                isBot: true,
                createdAt: true
              }
            }
          }
        });
        
        if (chat && chat.messages.length > 0) {
          conversationContext = chat.messages
            .reverse() // Oldest first
            .map(msg => `${msg.isBot ? 'AI' : msg.isAdmin ? 'Admin' : 'User'}: ${msg.content}`)
            .join('\n');
          
          // Check if files have been ACTUALLY shared (not just mentioned)
          const hasActualFileSharing = chat.messages.some(msg => 
            !msg.isBot && msg.content && (
              msg.content.includes('📎 Shared file:') ||
              msg.content.includes('📎 Shared ') && msg.content.includes('files:')
            )
          ) || (userMessage && (
            userMessage.includes('📎 Shared file:') ||
            (userMessage.includes('📎 Shared ') && userMessage.includes('files:'))
          ));
          
          if (hasActualFileSharing) {
            conversationContext += `\n\nIMPORTANT CONTEXT: User has actually shared files/documents in this conversation. Provide appropriate acknowledgment and closure.`;
          }
        }
      } catch (error) {
        console.log("Could not fetch conversation context:", error);
      }

                 const systemPrompt = `You are a helpful tax assistant for ReviseTax. Be natural, conversational, and focus on helping users with their tax needs without being overly promotional.

**About ReviseTax (www.revisetax.com):**
- Founded in 2019, based in Hyderabad, India
- Specializes in personalized strategic tax saving solutions for Indian taxpayers
- Served 250+ clients with ₹75L+ in total tax savings achieved
- 90% repeat engagement rate with 100% client satisfaction
- Expert team of professional accountants and tax consultants
- Contact: +91 9133 78 77 22 | contact@revisetax.com
- Address: No 304A, Rd Number 78, Jubilee Hills, Hyderabad - 500033
- We offer ITR filing, loans, and financial advisory services
- We have expert tax consultants and financial advisors
- We provide end-to-end support for all financial needs

**Our Comprehensive Services:**
1. **ITR Filing & Tax Planning:**
- ITR filing for salaried, self-employed, NRIs, capital gains
- Personalized tax saving strategies and optimization
- Old vs New tax regime analysis and recommendation

2. **Financial Advisory Services:**
- Investment planning (SIP, mutual funds, NPS)
- Wealth management and retirement planning
- Insurance advisory and portfolio optimization

3. **Business & Legal Services:**
- TDS compliance (26QB for property sales)
- GST filing and compliance
- Startup legal services (incorporation, documentation)
- Government registrations (PAN, FSSAI, shop licenses)
- Trademark registration and digital signatures

4. **Specialized Services:**
- Property transaction support
- Legal document drafting (agreements, contracts)
- Business setup and compliance

**STRICT SERVICE BOUNDARIES - CRITICAL:**
You can ONLY discuss ReviseTax services listed above. DO NOT answer questions about:
- General knowledge, weather, sports, entertainment, technology, cooking, travel
- Unrelated financial advice not connected to our services
- Other companies' services or comparisons
- Personal opinions on non-tax matters

**HOW TO HANDLE OFF-TOPIC QUESTIONS:**
Respond with: "I'm here to help you with ReviseTax services only - ITR filing, tax planning, financial advisory, and business services. How can I assist you with any of these services today?"

**Your Role:**
1. **NEVER send welcome messages** - the system handles initial greetings
2. **Understand Needs**: Find out what they need help with:
- ITR filing and tax questions
- Financial planning queries  
- Business compliance help
- Document guidance
3. **Ask Relevant Questions**: Based on their specific situation
4. **Provide Document Guidance**: Tell them what documents they'll need
5. **Natural Handoff**: After they share documents or provide enough info, let them know our team will help

**Document Requirements by Service:**
- **ITR-1 (Salaried)**: Form 16, salary slips, 80C/80D investments, bank statements
- **ITR-2 (Multiple Income)**: All ITR-1 docs + rental agreements, capital gains statements
- **ITR-3 (Business)**: P&L, balance sheet, GST returns, business bank statements
- **ITR-4 (Person with business or profession)**: Bank statements, GST returns
- **Property TDS**: Sale deed, property documents, buyer/seller details
- **Business Setup**: Identity proofs, address proofs, business plan

**ReviseTax Advantages:**
- Personalized consultation approach (not generic advice)
- Outcome-based pricing model
- Expert accountants with years of experience
- Comprehensive service portfolio under one roof
- Strong track record with 500+ client portfolio
- Free initial consultation available

**Conversation Guidelines:**
- Be natural, helpful, and conversational (NOT promotional or sales-heavy)
- Focus on solving user's immediate tax needs
- Ask specific questions to understand their situation
- Don't ask for sensitive information (PAN, Aadhaar numbers)
- Be concise and avoid repetitive promotional language
- **CRITICAL FILE HANDLING RULES**: When user shares files/documents:
1. Simply acknowledge: "Got it, thanks for sharing that!"
2. Confirm what they shared: "I can see you've shared [document type]"
3. Provide closure: "Our team will review this and get back to you soon."
4. **STOP** - Do NOT ask for more documents or repeat promotional content
5. **NEVER** say promotional phrases like "At ReviseTax, we specialize..." after file sharing
- After file sharing, conversations should naturally wind down with expert handoff

**Current conversation context:**
${conversationContext || 'This is the start of the conversation'}

**User's current message:** ${userMessage || 'User has just joined the chat'}

Be natural, helpful, and conversational. Focus on their specific tax needs without being promotional. After file sharing, provide simple closure and expert handoff. DO NOT send welcome/greeting messages as the system handles those.`;

      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage || "Hello, I need help from ReviseTax" }
      ];

      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages,
        max_tokens: 300,
        temperature: 0.3,  
      });

      return completion.choices[0].message.content.trim();
      
    } catch (error) {
      console.error("Error generating ChatGPT response:", error);
      
      // Intelligent fallback based on message count and file sharing
      const hasFileSharing = userMessage?.toLowerCase().includes('shared file') || 
                             userMessage?.toLowerCase().includes('uploaded') ||
                             userMessage?.toLowerCase().includes('document') ||
                             userMessage?.toLowerCase().includes('attachment') ||
                             userMessage?.toLowerCase().includes('form 16') ||
                             userMessage?.toLowerCase().includes('salary slip');
      
      if (hasFileSharing || messageCount > 4) {
        return "Got it, thanks for sharing that! Our team will review this and get back to you soon.";
      } else if (messageCount <= 2) {
        return "What specific tax help do you need today?";
      } else if (messageCount <= 3) {
        return "Thanks for that info. What other details can I help you with?";
      } else {
        return "Thanks for the details. Our team will review this and get back to you shortly.";
      }
    }
  }

  static async sendAutoResponse(chatId, chatType, chatName, socketIORoomId, userMessage = null, userProfile = null) {
    try {
      const response = await this.generateSimpleResponse(chatId, userMessage, chatType, chatName, userProfile);
      
      // Save the response message to database
      const message = await ChatService.saveMessage(
        chatId, 
        "system", 
        response, 
        false, // isAdmin = false
        true   // isBot = true
      );

      const messagePayload = {
        id: message.id,
        chatId,
        senderId: "system",
        content: response,
        isAdmin: false,
        isBot: true,
        timestamp: message.createdAt,
        senderName: "AI Assistant",
      };

      return messagePayload;
    } catch (error) {
      console.error("Error sending simple auto response:", error);
      throw error;
    }
  }

  static async generateConversationSummary(chatId) {
    try {
      // Get conversation history
      const chat = await prisma.chat.findUnique({
        where: { id: chatId },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            select: {
              content: true,
              isAdmin: true,
              isBot: true,
              createdAt: true
            }
          },
          user: {
            select: {
              name: true,
              email: true
            }
          }
        }
      });

      if (!chat) {
        return "## Conversation Summary\n\nChat not found.";
      }

    const messageCount = SimpleAutoResponse.getMessageCount(chatId);
      const userMessages = chat.messages.filter(msg => !msg.isAdmin && !msg.isBot);
      const aiMessages = chat.messages.filter(msg => msg.isBot);

      // Use ChatGPT to generate intelligent summary
      const conversationText = chat.messages
        .map(msg => `${msg.isBot ? 'AI Assistant' : msg.isAdmin ? 'Admin' : 'User'}: ${msg.content}`)
        .join('\n');

      const summaryPrompt = `Analyze this customer service conversation and provide a professional summary for the admin taking over:

**Conversation:**
${conversationText}

**User Profile:**
- Name: ${chat.user?.name || 'Not provided'}
- Email: ${chat.user?.email || 'Not provided'}

Please provide a concise summary covering:
1. What service the user is interested in (ITR/Loans/Financial Advisory)
2. Key information gathered from the user
3. Documents requested or next steps discussed
4. Current status and what the admin should focus on
5. Any specific user concerns or requirements

Keep it professional and actionable for the admin.`;

      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [
            { role: "system", content: "You are a helpful assistant that creates professional summaries for customer service handovers." },
            { role: "user", content: summaryPrompt }
          ],
          max_tokens: 400,
          temperature: 0.3,
        });

        return `## AI-Generated Conversation Summary\n\n${completion.choices[0].message.content.trim()}`;
      } catch (error) {
        console.error("Error generating AI summary:", error);
        
        // Fallback summary
        return `## Conversation Summary

**User:** ${chat.user?.name || 'Unknown'} (${chat.user?.email || 'No email'})
**Messages Exchanged:** ${messageCount} (${userMessages.length} from user, ${aiMessages.length} AI responses)
**Chat Duration:** ${chat.messages.length > 0 ? 'Started ' + new Date(chat.messages[0].createdAt).toLocaleString() : 'Just started'}

**Status:** AI assistant has been handling the conversation. User needs human expert assistance.
**Next Steps:** Admin should review the conversation above and continue helping the user with their requirements.

**Recent User Messages:**
${userMessages.slice(-3).map(msg => `- "${msg.content}"`).join('\n') || 'No user messages yet'}`;
      }
    } catch (error) {
      console.error("Error generating conversation summary:", error);
      const messageCount = SimpleAutoResponse.getMessageCount(chatId);
      return `## Conversation Summary

**Messages exchanged:** ${messageCount}
**Status:** AI assistant conversation completed, ready for expert consultation
**Next Steps:** Human expert should take over the conversation

Error generating detailed summary. Please review the conversation history above.`;
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
          userId: chat.userId,
          userName: chat.user?.name,
          userEmail: chat.user?.email,
          createdAt: chat.createdAt,
          updatedAt: chat.updatedAt,
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
          
          // Get admin's existing chats of all relevant statuses
          const existingChats = await prisma.chat.findMany({
            where: {
              OR: [
                // Chats assigned to this admin
                {
              adminId,
              isActive: true,
                  status: { in: ['PENDING', 'ACTIVE', 'CLOSED'] }
                },
                // Unassigned pending chats that this admin can take
                {
                  adminId: null,
                  isActive: true,
                  status: 'PENDING'
                }
              ]
            },
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

            // Send existing chats to admin (always send, even if empty)
            socket.emit("existing_admin_chats", {
              chats: existingChats.map(chat => {
                // Generate timestamp-based chat name if not provided
                let chatName = chat.chatName;
                if (!chatName) {
                  const timestamp = new Date(chat.createdAt);
                  const formattedDate = timestamp.toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric', 
                    year: 'numeric' 
                  });
                  const formattedTime = timestamp.toLocaleTimeString('en-US', { 
                    hour: '2-digit', 
                    minute: '2-digit',
                    hour12: true 
                  });
                  
                  chatName = `${chat.chatType.replace(/([A-Z])/g, ' $1').trim()} - ${formattedDate} ${formattedTime}`;
                }

                return {
                  id: chat.id,
                  chatName: chatName,
                  chatType: chat.chatType,
                  status: chat.status,
                  roomId: chat.socketIORoomId,
                  socketIORoomId: chat.socketIORoomId,
                  userName: chat.user?.name,
                  userEmail: chat.user?.email,
                  lastMessageAt: chat.lastMessageAt,
                  createdAt: chat.createdAt,
                  updatedAt: chat.updatedAt,
                  adminId: chat.adminId,
                  userId: chat.userId,
                  user: chat.user,
                  admin: chat.admin,
                  closedAt: chat.closedAt,
                  closedBy: chat.closedBy,
                  closeReason: chat.closeReason,
                  isActive: chat.isActive,
                  messages: [] // Will be loaded when chat is selected
                };
              })
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
              chats: existingChats.map(chat => {
                // Generate timestamp-based chat name if not provided
                let chatName = chat.chatName;
                if (!chatName) {
                  const timestamp = new Date(chat.createdAt);
                  const formattedDate = timestamp.toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric', 
                    year: 'numeric' 
                  });
                  const formattedTime = timestamp.toLocaleTimeString('en-US', { 
                    hour: '2-digit', 
                    minute: '2-digit',
                    hour12: true 
                  });
                  
                  chatName = `${chat.chatType.replace(/([A-Z])/g, ' $1').trim()} - ${formattedDate} ${formattedTime}`;
                }

                return {
                  id: chat.id,
                  chatName: chatName,
                  chatType: chat.chatType,
                  status: chat.status,
                  roomId: chat.socketIORoomId,
                  adminName: chat.admin?.name,
                  lastMessageAt: chat.lastMessageAt,
                };
              })
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
            chatName: chat.chatName,
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
      socket.on("start_chat", async ({ chatType, chatName, initialMessage }) => {
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

          // If user provided an initial message, save it
          if (initialMessage && initialMessage.trim()) {
            try {
              const userMessage = await ChatService.saveMessage(chat.id, userId, initialMessage.trim(), false, false);
              
              const userMessagePayload = {
                id: userMessage.id,
                chatId: chat.id,
                senderId: userId,
                content: initialMessage.trim(),
                isAdmin: false,
                isBot: false,
                timestamp: userMessage.createdAt,
                senderName: chat.user.name,
              };

              // Send user message to room
              io.to(chat.socketIORoomId).emit("new_message", userMessagePayload);
            } catch (error) {
              console.error("Error saving initial message:", error);
            }
          }

          // Always send AI response first to provide immediate user engagement
          try {
            const userProfile = { name: chat.user.name, email: chat.user.email };
            const autoResponseMessage = await SimpleAutoResponseService.sendAutoResponse(
              chat.id, 
              chatType, 
              chatName, 
              chat.socketIORoomId,
              initialMessage,
              userProfile
            );

            // Send auto-response to user immediately
            io.to(chat.socketIORoomId).emit("new_message", autoResponseMessage);

            console.log(`🤖 Initial AI response sent for chat: ${chat.id}`);
          } catch (error) {
            console.error("Error sending AI response:", error);
          }

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
                userId: chat.userId,
                userName: chat.user.name,
                userEmail: chat.user.email,
                createdAt: chat.createdAt,
                updatedAt: chat.updatedAt,
              });
            });

            socket.emit("chat_started", {
              chatId: chat.id,
              roomId: chat.socketIORoomId,
              chatName: chat.chatName,
              chatType: chat.chatType,
              status: "ACTIVE_WITH_AI"
            });

            console.log(`💬 Chat started: ${chat.id} - AI responding, admin ${availableAdmin.name} notified`);
          } else {
            // No admin available - notify offline admins
            await NotificationService.notifyOfflineAdmins(chat);

            socket.emit("chat_started", {
              chatId: chat.id,
              roomId: chat.socketIORoomId,
              chatName: chat.chatName,
              chatType: chat.chatType,
              status: "ACTIVE_WITH_AI"
            });

            console.log(`⏳ Chat started: ${chat.id} - AI responding, no admin available`);
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

          // Generate conversation summary if AI was involved
          const conversationSummary = await SimpleAutoResponseService.generateConversationSummary(chatId);

          // Send chat history to admin
          socket.emit("chat_history", {
            chatId,
            messages: chat.messages,
            user: chat.user,
            conversationSummary,
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
          const message = await ChatService.saveMessage(chatId, senderId, content, isAdmin, false);

          const messagePayload = {
            id: message.id,
            chatId,
            senderId,
            content,
            isAdmin,
            isBot: false,
            timestamp: message.createdAt,
            senderName: isAdmin ? chat.admin?.name : chat.user?.name,
          };

          // Broadcast to room
          io.to(chat.socketIORoomId).emit("new_message", messagePayload);

          // If user message and no admin is actively available, generate AI response
          if (!isAdmin) {
            let shouldSendAIResponse = false;
            let shouldSendOfflineNotification = false;

            if (!chat.adminId || chat.status === "PENDING") {
              // No admin assigned or chat is pending
              shouldSendAIResponse = true;
            } else if (chat.adminId && chat.status === "ACTIVE") {
              // Check if assigned admin is actually online and available
              const assignedAdmin = await prisma.admin.findUnique({
                where: { id: chat.adminId }
              });
              
              if (!assignedAdmin || !assignedAdmin.isOnline || !assignedAdmin.isActive) {
                // Admin is offline or inactive, AI should respond
                shouldSendAIResponse = true;
                shouldSendOfflineNotification = true;
                console.log(`🤖 Admin ${chat.adminId} is offline, AI taking over chat ${chatId}`);
              } else {
                // Check if admin has active socket connections AND is actually in this chat room
                const adminSocketIds = Array.from(adminSessions.entries())
                  .filter(([_, adminId]) => adminId === chat.adminId)
                  .map(([socketId, _]) => socketId);
                
                if (adminSocketIds.length === 0) {
                  // Admin has no active socket connections
                  shouldSendAIResponse = true;
                  shouldSendOfflineNotification = true;
                  console.log(`🤖 Admin ${chat.adminId} has no active connections, AI taking over chat ${chatId}`);
                } else {
                  // Check if admin is actually present in this specific chat room
                  const participants = roomParticipants.get(chat.socketIORoomId) || new Set();
                  const adminInRoom = adminSocketIds.some(socketId => participants.has(socketId));
                  
                  if (!adminInRoom) {
                    // Admin is online but hasn't joined this chat room yet
                    shouldSendAIResponse = true;
                    console.log(`🤖 Admin ${chat.adminId} is online but hasn't joined chat room ${chat.socketIORoomId}, AI responding`);
                  }
                }
              }
            }

            // Send offline notification only once if needed
            if (shouldSendOfflineNotification) {
              // Check if we already sent an offline notification recently (within last 5 minutes)
              const recentOfflineMessage = await prisma.message.findFirst({
                where: {
                  chatId,
                  isBot: true,
                  content: {
                    contains: "Our tax expert is currently offline"
                  },
                  createdAt: {
                    gte: new Date(Date.now() - 5 * 60 * 1000) // Last 5 minutes
                  }
                },
                orderBy: {
                  createdAt: 'desc'
                }
              });

              if (!recentOfflineMessage) {
                // Send admin offline notification to user
                const offlineMessage = await ChatService.saveMessage(
                  chatId, 
                  "system", 
                  "Our tax expert is currently offline. Our team will get back to you soon! In the meantime, I'm here to help with any tax-related questions you might have. 😊", 
                  false, // isAdmin = false
                  true   // isBot = true
                );

                const offlineMessagePayload = {
                  id: offlineMessage.id,
                  chatId,
                  senderId: "system",
                  content: "Our tax expert is currently offline. Our team will get back to you soon! In the meantime, I'm here to help with any tax-related questions you might have. 😊",
                  isAdmin: false,
                  isBot: true,
                  timestamp: offlineMessage.createdAt,
                  senderName: "AI Assistant",
                };

                // Send offline notification to room
                io.to(chat.socketIORoomId).emit("new_message", offlineMessagePayload);
              }
            }

            if (shouldSendAIResponse) {
              try {
                // Check if this is the first AI interaction in this chat
                const existingAIMessages = await prisma.message.count({
                  where: {
                    chatId,
                    isBot: true
                  }
                });

                const userProfile = { name: chat.user?.name, email: chat.user?.email };
                
                // For first message, send welcome with consultant info
                if (existingAIMessages === 0) {
                  const welcomeMessage = "Hello! Welcome to ReviseTax. I'm here to assist you with any tax-related questions or help you might need. Our tax consultant will be connecting soon to provide personalized assistance. How can I help you today with our services like ITR filing, tax planning, financial advisory, or business compliance?";
                  
                  const greetingMessage = await ChatService.saveMessage(
                    chatId, 
                    "system", 
                    welcomeMessage, 
                    false, // isAdmin = false
                    true   // isBot = true
                  );

                  const greetingPayload = {
                    id: greetingMessage.id,
                    chatId,
                    senderId: "system",
                    content: welcomeMessage,
                    isAdmin: false,
                    isBot: true,
                    timestamp: greetingMessage.createdAt,
                    senderName: "AI Assistant",
                  };

                  // Send greeting to room - no additional AI response for first message
                  io.to(chat.socketIORoomId).emit("new_message", greetingPayload);
                } else {
                  // For subsequent messages, generate AI response
                  const aiResponse = await SimpleAutoResponseService.sendAutoResponse(
                    chatId,
                    chat.chatType,
                    chat.chatName,
                    chat.socketIORoomId,
                    content,
                    userProfile
                  );

                  // Send AI response to room
                  io.to(chat.socketIORoomId).emit("new_message", aiResponse);
                }
              
              console.log(`🤖 AI response sent for chat: ${chatId}`);
            } catch (error) {
              console.error("Error sending AI response:", error);
              }
            }
          }

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
          where: { 
            status: "PENDING",
            isActive: true 
          },
          include: {
            user: {
              select: {
                name: true,
                email: true,
                phoneNumber: true,
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

          // Clear simple auto response context
          SimpleAutoResponse.clearContext(chatId);

          console.log(`🔒 Chat ${chatId} closed by admin ${adminId}`);

          // After admin closes a chat:
          await allocatePendingChats();
        } catch (error) {
          console.error("Error closing chat:", error);
          socket.emit("error", { message: "Failed to close chat" });
        }
      });

      // Update chat name
      socket.on("update_chat_name", async ({ chatId, newChatName }) => {
        try {
          const userId = userSessions.get(socket.id);
          const adminId = adminSessions.get(socket.id);
          
          if (!userId && !adminId) {
            socket.emit("error", { message: "Not authenticated" });
            return;
          }

          const chat = await prisma.chat.findUnique({
            where: { id: chatId }
          });

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

          // Update chat name
          const updatedChat = await ChatService.updateChatName(chatId, newChatName);

          // Notify all participants in the room about the name change
          io.to(chat.socketIORoomId).emit("chat_name_updated", {
            chatId,
            newChatName,
            updatedAt: updatedChat.updatedAt
          });

          console.log(`✏️ Chat name updated: ${chatId} -> "${newChatName}"`);
        } catch (error) {
          console.error("Error updating chat name:", error);
          socket.emit("error", { message: "Failed to update chat name" });
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
                userId: chat.userId,
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