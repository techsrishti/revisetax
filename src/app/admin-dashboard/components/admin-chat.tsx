"use client"

import { useEffect, useState } from "react"
import { io } from "socket.io-client"
import { getAdminChats } from "../actions"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import styles from "./admin-chat.module.css"

interface Chat {
  id: string
  chatName: string
  socketIORoomId: string
  userId: string
  user: {
    name: string | null
    email: string | null
    phoneNumber: string
  }
  updatedAt: Date
  chatType: string
  messages: {
    id: string
    content: string | null
    createdAt: Date
    isAdmin: boolean
  }[]
}

export default function AdminChat() {
  const [chats, setChats] = useState<Chat[]>([])
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null)
  const [message, setMessage] = useState("")
  const [socket, setSocket] = useState<any>(null)
  const [isTyping, setIsTyping] = useState(false)
  const [typingTimeout, setTypingTimeout] = useState<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const fetchChats = async () => {
      const response = await getAdminChats()
      if (response.success) {
        setChats(response.chats)
        if (response.chats.length > 0) {
          setSelectedChat(response.chats[0])
        }
      }
    }

    fetchChats()

    // Initialize socket connection
    const socketInstance = io("http://18.60.99.199:3001")
    setSocket(socketInstance)

    return () => {
      socketInstance.disconnect()
    }
  }, [])

  useEffect(() => {
    if (!socket || !selectedChat) return

    socket.emit("join_room", {
      roomCode: selectedChat.socketIORoomId,
      userId: "admin_1"
    })

    socket.on("receive_message", (msgPayload: any) => {
      setChats(prevChats => {
        return prevChats.map(chat => {
          if (chat.id === selectedChat.id) {
            return {
              ...chat,
              messages: [
                {
                  id: msgPayload.id,
                  content: msgPayload.message,
                  createdAt: new Date(msgPayload.timestamp),
                  isAdmin: false
                },
                ...chat.messages
              ]
            }
          }
          return chat
        })
      })
    })


  socket.on("user_joined_room", (msgPayload: any) => {
    console.log("user_joined_room", msgPayload)
    //if chat is in sidebar. move it to the top else add it to the sidebar at the top 
    const anonymousName = msgPayload.senderId
    //add to chats 
    //if chat in sidebar move to the top 
    if (selectedChat && selectedChat.id === msgPayload.roomCode) {
      setSelectedChat(null)
      setSelectedChat(msgPayload)
    } else {

    setChats(prevChats => {
      return [
        {
          id: "test_id",
          chatName: anonymousName,
          socketIORoomId: msgPayload.roomCode as string || "test_room",
          userId: msgPayload.senderId as string || "test_user",
          user: { 
            name: anonymousName,
            email: null,
            phoneNumber: "1234567890"
          },
          updatedAt: new Date(),
          chatType: "anonymous",
          messages: []
        },
        ...prevChats
      ]
    })
  }
  })
    

    socket.on("started_typing", () => {
      setIsTyping(true)
    })

    socket.on("stopped_typing", () => {
      setIsTyping(false)
    })

    return () => {
      socket.off("receive_message")
      socket.off("started_typing")
      socket.off("stopped_typing")
    }
  }, [socket, selectedChat])

  const handleSendMessage = () => {
    if (!message.trim() || !selectedChat || !socket) return

    const msgPayload = {
      roomCode: selectedChat.socketIORoomId,
      senderId: "admin_1",
      message: message.trim()
    }

    socket.emit("send_message", msgPayload)

    // Update local state
    setChats(prevChats => {
      return prevChats.map(chat => {
        if (chat.id === selectedChat.id) {
          return {
            ...chat,
            messages: [
              {
                id: Date.now().toString(),
                content: message.trim(),
                createdAt: new Date(),
                isAdmin: true
              },
              ...chat.messages
            ]
          }
        }
        return chat
      })
    })

    setMessage("")
  }

  const handleTyping = () => {
    if (!selectedChat || !socket) return

    socket.emit("start_typing", {
      roomCode: selectedChat.socketIORoomId,
      senderId: "admin_1"
    })

    if (typingTimeout) {
      clearTimeout(typingTimeout)
    }

    const timeout = setTimeout(() => {
      socket.emit("stop_typing", {
        roomCode: selectedChat.socketIORoomId,
        senderId: "admin_1"
      })
    }, 1000)

    setTypingTimeout(timeout)
  }

  if (chats.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.noChats}>
          <h2>No chats found</h2>
          <p>There are no active chats at the moment.</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      {/* Chat List Sidebar */}
      <div className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <h2>Chats</h2>
        </div>
        <div className={styles.chatList}>
          {chats.map((chat) => (
            <div
              key={chat.id}
              className={cn(styles.chatItem, {
                [styles.active]: selectedChat?.id === chat.id
              })}
              onClick={() => setSelectedChat(chat)}
            >
              <div className={styles.chatInfo}>
                <h3>{chat.user.name || chat.user.email || chat.user.phoneNumber}</h3>
                <p className={styles.chatType}>{chat.chatType}</p>
                {chat.messages[0] && (
                  <p className={styles.lastMessage}>
                    {chat.messages[0].content}
                  </p>
                )}
              </div>
              <div className={styles.chatMeta}>
                <span className={styles.timestamp}>
                  {format(new Date(chat.updatedAt), "MMM d, h:mm a")}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      {selectedChat && (
        <div className={styles.chatArea}>
          <div className={styles.chatHeader}>
            <h2>{selectedChat.user.name || selectedChat.user.email || selectedChat.user.phoneNumber}</h2>
            <p className={styles.chatType}>{selectedChat.chatType}</p>
          </div>

          <div className={styles.messages}>
            {selectedChat.messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(styles.message, {
                  [styles.adminMessage]: msg.isAdmin
                })}
              >
                <div className={styles.messageContent}>
                  {msg.content}
                </div>
                <div className={styles.messageTime}>
                  {format(new Date(msg.createdAt), "h:mm a")}
                </div>
              </div>
            ))}
          </div>

          {isTyping && (
            <div className={styles.typingIndicator}>
              User is typing...
            </div>
          )}

          <div className={styles.inputArea}>
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={handleTyping}
              placeholder="Type a message..."
              className={styles.input}
            />
            <button
              onClick={handleSendMessage}
              className={styles.sendButton}
              disabled={!message.trim()}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  )
} 