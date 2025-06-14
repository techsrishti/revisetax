const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { createClient } = require("redis");
const { createAdapter } = require("@socket.io/redis-adapter");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

// Redis setup
const pubClient = createClient({ url: "redis://localhost:6379" });
const subClient = pubClient.duplicate();

// Track online admins
const adminSockets = new Map(); // key: adminId, value: socketId

async function init() {
  console.log("Initializing server...");
  await pubClient.connect();
  await subClient.connect();
  io.adapter(createAdapter(pubClient, subClient));

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    // Identify admin
    socket.on("identify_as_admin", ({ adminId }) => {
      adminSockets.set(adminId, socket.id);
      console.log(`✅ Admin '${adminId}' connected with socket ${socket.id}`);
    });

    // User joins chat room
    socket.on("join_room", ({ roomCode, userId, name }) => {
      socket.join(roomCode);
      console.log(`👤 User '${userId}' (${name}) joined room: ${roomCode}`);

      // Simulate lookup: assigned admin is admin_1
      const assignedAdmin = "admin_1";
      const adminSocketId = adminSockets.get(assignedAdmin);

      if (adminSocketId) {
        io.to(adminSocketId).emit("user_joined_room", {
          roomCode,
          userId,
          name,
        });

        // Auto-join admin to room
        const adminSocket = io.sockets.sockets.get(adminSocketId);
        if (adminSocket) {
          adminSocket.join(roomCode);
          console.log(`👨‍💼 Admin '${assignedAdmin}' auto-joined room: ${roomCode}`);
        }
      } else {
        console.log(`⚠️ Admin '${assignedAdmin}' is offline. Event not sent.`);
      }
    });

    // Admin manually joins a chat room (e.g. from clicking sidebar)
    socket.on("admin_join_chat", ({ roomCode, adminId }) => {
      socket.join(roomCode);
      console.log(`👨‍💼 Admin '${adminId}' manually joined room: ${roomCode}`);
    });

    // Send message
    socket.on("send_message", ({ roomCode, senderId, message }) => {
      const msgPayload = {
        senderId,
        message,
        roomCode,
        timestamp: new Date().toISOString(),
      };

      console.log(`💬 Message from '${senderId}' in '${roomCode}': ${message}`);

      socket.emit("message_sent", msgPayload);
      socket.to(roomCode).emit("receive_message", msgPayload);
    });

    // Typing indicators
    socket.on("start_typing", ({ roomCode }) => {
      socket.to(roomCode).emit("started_typing");
    });

    socket.on("stop_typing", ({ roomCode }) => {
      socket.to(roomCode).emit("stopped_typing");
    });

    // Disconnect
    socket.on("disconnect", () => {
      for (const [adminId, sockId] of adminSockets.entries()) {
        if (sockId === socket.id) {
          adminSockets.delete(adminId);
          console.log(`❌ Admin '${adminId}' disconnected`);
        }
      }

      console.log("Client disconnected:", socket.id);
    });
  });

  server.listen(3001, () => {
    console.log("🚀 Socket.IO server running on http://localhost:3001");
  });
}

init().catch((err) => console.error("Server init error:", err));
