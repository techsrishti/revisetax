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
    const socketInstance = io("http://18.60.99.199:3003")
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
      // Create a Map to store unique chats by ID
      const uniqueChats = new Map()
      
      data.chats.forEach((chat: any) => {
        uniqueChats.set(chat.id, {
          id: chat.id,
          name: chat.chatName,
          type: chat.chatType,
          isActive: chat.status === 'ACTIVE'
        })
      })
      
      // Convert Map values back to array
      setChats(Array.from(uniqueChats.values()))
      
      // Mark all existing chats as joined since the server automatically joins them
      const existingChatIds = new Set<string>(data.chats.map((chat: any) => chat.id as string))
      setJoinedChats(existingChatIds)
    })

    // socketInstance.on("chat_started", (data) => {
    //   console.log("Chat started:", data)
    //   // This is now handled via the callback from ChatModule
    // })

    socketInstance.on("admin_joined", (data) => {
      console.log("Admin joined:", data)
      // Update chat status to active
      setChats(prevChats => {
        const updatedChats = prevChats.map(chat => 
          chat.id === data.chatId 
            ? { ...chat, isActive: true }
            : chat
        )
        // Remove any duplicates
        const uniqueChats = new Map(updatedChats.map(chat => [chat.id, chat]))
        return Array.from(uniqueChats.values())
      })
    })

    return () => {
      socketInstance.disconnect()
    }
  }, [user])

  const handleChatStarted = useCallback((chatName: string, chatType: string, chatId: string, roomId: string) => {
    // Create a new chat entry
    const newChat: Chat = {
      id: chatId,
      name: chatName,
      type: chatType,
      isActive: false
    }
    
    setChats(prevChats => {
      // Check if chat already exists
      const chatExists = prevChats.some(chat => chat.id === chatId)
      if (chatExists) {
        return prevChats
      }
      return [...prevChats, newChat]
    })
    
    // Mark the chat as joined
    setJoinedChats(prev => new Set([...prev, chatId]))
    
    // Automatically select the new chat
    setSelectedChatId(chatId)
    setActiveModule("chat")
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
