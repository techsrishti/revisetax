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
  cors: {
    origin: "*",
  },
});

const adminId = "admin_1";
const pubClient = createClient({ url: "redis://localhost:6379" });
const subClient = pubClient.duplicate();
pubClient.on('error', err => {
  console.error('Redis Pub Client Error:', err);
});

        subClient.on('error', err => {
  console.error('Redis Sub Client Error:', err);
});
async function init() { 
	console.log("init called");
	await pubClient.connect();
  await subClient.connect();
  io.adapter(createAdapter(pubClient, subClient));

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.on("join_room", ({ roomCode, userId }) => {
    	socket.join(roomCode);
	  if (userId != "admin_1") {
	    console.log(`User ${userId} joined room: ${roomCode}`);
    io.emit("user_joined_room", { roomCode, userId });
    }

  });

  socket.on("send_message", ({ roomCode, senderId, message }) => {
    const msgPayload = {
      senderId,
      message,
      roomCode,
      timestamp: new Date().toISOString(),
    };

    console.log(`Message from ${senderId} in room ${roomCode}: ${message}`);

    // 1. Send confirmation to sendersocket.emit("message_sent", msgPayload);
    // 2. Broadcast message to everyone in the room
    
    socket.emit("message_sent", msgPayload); 
    socket.to(roomCode).emit("receive_message", msgPayload);

  });

  socket.on("start_typing", ({ roomCode, senderId }) => { 
    socket.to(roomCode).emit("started_typing")
  });
 
  socket.on("stop_typing", ({ roomCode, senderId }) => { 
    socket.to(roomCode).emit("stopped_typing")
  });


  socket.on("disconnect", () => {
    console.log("client disconnected:", socket.id);
  });
});

server.listen(3001, () => {
  console.log(" Socket.IO server running on http://localhost:3001");
});
}

init();