"use client"

import { useState, useEffect, useCallback } from "react"
import ChatModule from "@/components/chat-module"
import PlansModule from "@/components/plans-module"
import DocumentsModule from "@/components/documents-module"
import BillingModule from "@/components/billing-module"
import Sidebar from "@/components/sidebar"
import { io } from "socket.io-client"
import { createClient } from "@/utils/supabase/client"
import styles from "./styles.module.css"

interface Chat {
  id: string
  name: string
  type: string
  isActive: boolean
}

export default function Dashboard() {
  const [activeModule, setActiveModule] = useState("chat")
  const [chats, setChats] = useState<Chat[]>([])
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null)
  const [joinedChats, setJoinedChats] = useState<Set<string>>(new Set())
  const [socket, setSocket] = useState<any>(null)
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        setUser(user)
      } catch (error) {
        console.error('Error fetching user:', error)
      }
    }

    fetchUser()
  }, [])

  useEffect(() => {
    if (!user) return

    // Initialize socket connection
    const socketInstance = io("http://18.60.99.199:3001")
    console.log("socketInstance in dashboard")
    setSocket(socketInstance)

    // Authenticate user
    console.log("user.id in dashboard", user.id)
    socketInstance.emit("user_authenticate", { supabaseUserId: user.id })

    socketInstance.on("user_authenticated", (data) => {
      console.log("User authenticated:", data)
    })

    socketInstance.on("existing_chats", (data) => {
      console.log("Existing chats received:", data)
      const formattedChats = data.chats.map((chat: any) => ({
        id: chat.id,
        name: chat.chatName,
        type: chat.chatType,
        isActive: chat.status === 'ACTIVE'
      }))
      setChats(formattedChats)
      
      // Mark all existing chats as joined since the server automatically joins them
      const existingChatIds = new Set<string>(data.chats.map((chat: any) => chat.id as string))
      setJoinedChats(existingChatIds)
    })

    socketInstance.on("chat_started", (data) => {
      console.log("Chat started:", data)
      // The chat will be added to the list when we receive the existing_chats event
    })

    socketInstance.on("admin_joined", (data) => {
      console.log("Admin joined:", data)
      // Update chat status to active
      setChats(prevChats => 
        prevChats.map(chat => 
          chat.id === data.chatId 
            ? { ...chat, isActive: true }
            : chat
        )
      )
    })

    return () => {
      socketInstance.disconnect()
    }
  }, [user])

  const handleChatStarted = useCallback((chatName: string, chatType: string) => {
    // Create a temporary chat entry
    const tempChat: Chat = {
      id: `temp_${Date.now()}`,
      name: chatName,
      type: chatType,
      isActive: false
    }
    setChats(prevChats => [...prevChats, tempChat])
  }, [])

  const handleChatSelect = (chatId: string) => {
    console.log("handleChatSelect called with chatId:", chatId)
    
    if (!chatId) {
      // Clear selected chat (when clicking main Chat item)
      console.log("Clearing selected chat")
      setSelectedChatId(null)
      return
    }
    
    // Switch to chat module and select the specific chat
    setActiveModule("chat")
    setSelectedChatId(chatId)
    
    // Join the chat if not already joined
    if (socket && !joinedChats.has(chatId)) {
      console.log("Joining chat:", chatId)
      socket.emit("join_existing_chat", { chatId })
      setJoinedChats(prev => new Set([...prev, chatId]))
    } else if (joinedChats.has(chatId)) {
      console.log("Chat already joined:", chatId)
    }
  }

  const handleModuleChange = (module: string) => {
    setActiveModule(module)
    // Clear selected chat when switching to non-chat modules
    if (module !== "chat") {
      setSelectedChatId(null)
    }
  }

  const handleJoinChat = useCallback((chatId: string) => {
    // Join the chat if not already joined
    if (socket && !joinedChats.has(chatId)) {
      console.log("Joining chat via ChatModule:", chatId)
      socket.emit("join_existing_chat", { chatId })
      setJoinedChats(prev => new Set([...prev, chatId]))
    } else if (joinedChats.has(chatId)) {
      console.log("Chat already joined via ChatModule:", chatId)
    }
  }, [socket, joinedChats])

  const handleBackToChats = useCallback(() => {
    setSelectedChatId(null)
  }, [])

  return (
    <div className={styles.container}>
      <Sidebar 
        activeModule={activeModule} 
        setActiveModule={handleModuleChange}
        chats={chats}
        onChatSelect={handleChatSelect}
        selectedChatId={selectedChatId}
      />
      <div className={styles.content}>
        {activeModule === "chat" && (
          <ChatModule 
            onChatStarted={handleChatStarted}
            selectedChatId={selectedChatId || undefined}
            onBackToChats={handleBackToChats}
            socket={socket}
            onJoinChat={handleJoinChat}
          />
        )}
        {activeModule === "documents" && <DocumentsModule />}
        {activeModule === "plans" && <BillingModule />}
        {activeModule === "billing" && <PlansModule />}
      </div>
    </div>
  )
}
