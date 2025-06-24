"use client"

import { useEffect, useState, useTransition, useRef } from "react"
import { io } from "socket.io-client"
import { getAdminChats } from "../actions"
import {
  getChatDetails,
  getUserDocuments,
  assignChatToAdmin,
  createOsTicket,
  createHubspotTicket,
} from "../actions/chat-panel"
import { format, isToday, isYesterday } from "date-fns"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  MoreVertical,
  Search,
  Send,
  FileText,
  Ticket,
  User,
  Power,
  Loader2,
  MessageSquare,
  Files,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Toaster } from "@/components/ui/toaster"

interface AdminDetails {
  id: string
  name: string
  email: string
  authId: string
}

interface BaseChat {
  id: string
  chatName: string
  socketIORoomId: string
  userId: string
  adminId: string | null
  user: {
    name: string | null
    email: string | null
    phoneNumber: string
  }
  admin?: {
    id: string
    name: string
    email: string
  } | null
  createdAt: Date
  updatedAt: Date
  lastMessageAt?: Date | null
  chatType: string
  status: string
  closedAt: Date | null
  closedBy: string | null
  closeReason: string | null
  isActive: boolean
  messages: {
    id: string
    content: string | null
    createdAt: Date
    isAdmin: boolean
  }[]
}

interface Chat extends BaseChat {
}

interface ChatDetails extends Chat {
  user: {
    name: string | null
    email: string | null
    phoneNumber: string
    Subscription: {
      planName: string
      Plan: {
        name: string
      } | null
    } | null
  }
}

interface DocumentFile {
  id: string
  originalName: string
  storageName: string
  createdAt: Date
}

interface DocumentFolder {
  id:string
  name: string
  File: DocumentFile[]
}

const formatTimestamp = (date: Date | string | undefined | null) => {
  if (!date) return "-"
  const d = new Date(date)
  if (isNaN(d.getTime())) return "-"
  if (isToday(d)) {
    return format(d, "h:mm a")
  }
  if (isYesterday(d)) {
    return "Yesterday"
  }
  return format(d, "MMM d, yyyy")
}

const formatSidebarTimestamp = (date: Date | string | undefined | null) => {
  if (!date) return "-"
  const d = new Date(date)
  if (isNaN(d.getTime())) return "-"
  if (isToday(d)) {
    return format(d, "p") // 5:41 PM
  }
  if (isYesterday(d)) {
    return "Yesterday"
  }
  return format(d, "d MMM") // 21 Jun
}

export default function AdminChat() {
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()
  const [chats, setChats] = useState<Chat[]>([])
  const [selectedChat, setSelectedChat] = useState<ChatDetails | null>(null)
  const [userDocs, setUserDocs] = useState<DocumentFolder[]>([])
  const [message, setMessage] = useState("")
  const [socket, setSocket] = useState<any>(null)
  const [isTyping, setIsTyping] = useState(false)
  const [typingTimeout, setTypingTimeout] = useState<NodeJS.Timeout | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [currentAdminId, setCurrentAdminId] = useState<string | null>(null)
  const [isLoadingChat, setIsLoadingChat] = useState(false)
  const [messages, setMessages] = useState<any[]>([])
  const [joinedRooms, setJoinedRooms] = useState<string[]>([])
  const [adminDetails, setAdminDetails] = useState<AdminDetails | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const selectedChatRef = useRef(selectedChat)
  const messagesContainerRef = useRef<HTMLDivElement | null>(null)
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)

  useEffect(() => {
    selectedChatRef.current = selectedChat
  }, [selectedChat])

  // Only scroll to bottom when user sends a message
  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }

  // Fetch admin details from API
  const fetchAdminDetails = async (): Promise<AdminDetails | null> => {
    try {
      const response = await fetch('/api/admin/current')
      if (!response.ok) {
        throw new Error('Failed to fetch admin details')
      }
      const data = await response.json()
      if (data.success && data.admin) {
        return data.admin
      }
      throw new Error('Admin details not found')
    } catch (error) {
      console.error('Error fetching admin details:', error)
      return null
    }
  }

  useEffect(() => {
    // Initialize socket connection and admin authentication
    const initializeSocket = async () => {
      try {
        // First, fetch admin details
        const admin = await fetchAdminDetails()
        if (!admin) {
          console.error('Failed to fetch admin details')
          setIsLoading(false)
          return
        }

        setAdminDetails(admin)
        setCurrentAdminId(admin.id)

        // Initialize socket connection
        const socketInstance = io("http://18.60.99.199:3002")
        setSocket(socketInstance)

        // Authenticate admin on connect
        socketInstance.on("connect", () => {
          socketInstance.emit("admin_authenticate", { 
            adminId: admin.id, 
            adminEmail: admin.email 
          })
        })

        // Listen for authentication success
        socketInstance.on("admin_authenticated", (data: any) => {
          console.log("Admin authenticated:", data)
          setIsAuthenticated(true)
        })

        // Listen for authentication error
        socketInstance.on("auth_error", (data: any) => {
          console.error("Admin authentication failed:", data)
          setIsAuthenticated(false)
        })

        // Listen for chat list
        socketInstance.on("existing_admin_chats", (data: any) => {
          if (data.chats && Array.isArray(data.chats)) {
            const mappedChats = data.chats.map((c: any) => ({
              ...c,
              socketIORoomId: c.roomId || c.socketIORoomId, // Map roomId to socketIORoomId
              updatedAt: c.updatedAt ? new Date(c.updatedAt) : new Date(),
              user: c.user || { name: '', email: '', phoneNumber: '' }
            }))
            // Remove duplicates based on chat ID
            const uniqueChats = mappedChats.filter((chat: any, index: number, self: any[]) => 
              index === self.findIndex((c: any) => c.id === chat.id)
            )
            setChats(uniqueChats)
            // Set current admin id from first chat with admin
            const adminChat = data.chats.find((chat: any) => chat.adminId && chat.admin)
            if (adminChat?.admin?.id) setCurrentAdminId(adminChat.admin.id)
          } else {
            setChats([])
          }
          setIsLoading(false)
        })

        // Listen for new chat requests (add to chat list)
        socketInstance.on("new_chat_request", (data: any) => {
          setChats(prev => {
            // Check if chat already exists
            const chatExists = prev.some(chat => chat.id === data.chatId)
            if (chatExists) {
              return prev
            }
            
            // Create new chat object with all required properties
            const newChat: Chat = {
              id: data.chatId,
              chatName: data.chatName || 'New Chat',
              socketIORoomId: data.roomId || data.socketIORoomId,
              userId: data.userId,
              adminId: admin.id,
              user: data.user || { name: data.userName || '', email: data.userEmail || '', phoneNumber: '' },
              updatedAt: data.updatedAt ? new Date(data.updatedAt) : new Date(),
              createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
              lastMessageAt: data.lastMessageAt ? new Date(data.lastMessageAt) : null,
              chatType: data.chatType,
              status: "PENDING",
              closedAt: null,
              closedBy: null,
              closeReason: null,
              isActive: true,
              messages: [],
            }
            
            return [newChat, ...prev]
          })
        })

        // Listen for chat history
        socketInstance.on("chat_history", (data: any) => {
          if (data && data.messages) {
            // Ensure messages have the correct structure
            const formattedMessages = data.messages.map((msg: any) => ({
              id: msg.id,
              content: msg.content || msg.message || '',
              createdAt: msg.createdAt ? new Date(msg.createdAt) : new Date(),
              isAdmin: msg.isAdmin || false,
              chatId: msg.chatId || data.chatId
            }))
            
            setMessages(formattedMessages)
          } else {
            setMessages([])
          }
          setIsLoadingChat(false)
        })

        // Listen for new messages
        socketInstance.on("new_message", (msg: any) => {
          // msg should contain { id, content, createdAt, isAdmin, chatId }
          
          // Ensure the message has the correct structure with proper timestamp
          const formattedMsg = {
            id: msg.id,
            content: msg.content || msg.message || '',
            createdAt: msg.createdAt ? new Date(msg.createdAt) : new Date(),
            isAdmin: msg.isAdmin || false,
            chatId: msg.chatId
          }

          // Update the message list if it's for the currently selected chat
          if (formattedMsg.chatId === selectedChatRef.current?.id) {
            setMessages(prev => {
              // Check if message already exists to prevent duplicates
              const messageExists = prev.some(existingMsg => existingMsg.id === formattedMsg.id)
              if (messageExists) {
                return prev
              }
              return [...prev, formattedMsg]
            })
          }

          // Update the chat list in the sidebar
          setChats(prevChats => {
            const updatedChats = prevChats.map(chat => {
              if (chat.id === formattedMsg.chatId) {
                // Check if message already exists in chat messages
                const messageExists = Array.isArray(chat.messages) && 
                  chat.messages.some(existingMsg => existingMsg.id === formattedMsg.id)
                
                return {
                  ...chat,
                  updatedAt: new Date(formattedMsg.createdAt),
                  messages: messageExists ? chat.messages : [formattedMsg, ...(Array.isArray(chat.messages) ? chat.messages : [])],
                }
              }
              return chat
            })
            // Remove any duplicates that might have been created
            const uniqueChats = updatedChats.filter((chat, index, self) => 
              index === self.findIndex(c => c.id === chat.id)
            )
            // Sort chats to bring the most recent to the top
            return uniqueChats.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
          })
        })

        return () => {
          socketInstance.disconnect()
        }
      } catch (error) {
        console.error('Error initializing socket:', error)
        setIsLoading(false)
      }
    }

    initializeSocket()
  }, [])

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages])

  // Join room handler
  const handleJoinRoom = async (chat: Chat) => {
    if (!socket || !isAuthenticated || !adminDetails) return
    setIsLoadingChat(true)
    socket.emit("admin_join_chat", { chatId: chat.id })
    setJoinedRooms([chat.socketIORoomId]) // Only keep the current joined room
    
    const loadingTimeout = setTimeout(() => {
      setIsLoadingChat(false);
      toast({
        title: "Error",
        description: "Could not join chat. Please try again.",
        variant: "destructive"
      });
    }, 8000); // 8-second timeout

    socket.once("chat_history", () => {
      clearTimeout(loadingTimeout);
    });
    
    // Fetch detailed chat information including user details
    try {
      const chatDetailsResult = await getChatDetails(chat.id);
      if (chatDetailsResult.success && chatDetailsResult.chat) {
        const detailedChat = chatDetailsResult.chat as ChatDetails;
        setSelectedChat(detailedChat);
        
        // Fetch user documents if user exists
        if (detailedChat.userId) {
          const docsResult = await getUserDocuments(detailedChat.userId);
          if (docsResult.success && docsResult.folders) {
            setUserDocs(docsResult.folders as DocumentFolder[]);
          } else {
            setUserDocs([]);
          }
        }
      } else {
        // Fallback to basic chat info if detailed fetch fails
        setSelectedChat(chat as any);
      }
    } catch (error) {
      console.error("Error fetching chat details:", error);
      // Fallback to basic chat info
      setSelectedChat(chat as any);
    }
    
    // After joining, request chat history
    socket.emit("get_chat_history", { chatId: chat.id })
  }

  // When a chat is selected (only if already joined)
  const handleSelectChat = async (chat: Chat) => {
    if (!joinedRooms.includes(chat.socketIORoomId) || !isAuthenticated || !adminDetails) return;
    
    setIsLoadingChat(true);
    setMessages([]);

    const loadingTimeout = setTimeout(() => {
      setIsLoadingChat(false);
      toast({
        title: "Error",
        description: "Could not load chat history. Please try again.",
        variant: "destructive"
      });
    }, 8000); // 8-second timeout

    socket.once("chat_history", () => {
      clearTimeout(loadingTimeout);
    });
    
    try {
      // Fetch detailed chat information including user details
      const chatDetailsResult = await getChatDetails(chat.id);
      if (chatDetailsResult.success && chatDetailsResult.chat) {
        const detailedChat = chatDetailsResult.chat as ChatDetails;
        setSelectedChat(detailedChat);
        
        // Fetch user documents if user exists
        if (detailedChat.userId) {
          const docsResult = await getUserDocuments(detailedChat.userId);
          if (docsResult.success && docsResult.folders) {
            setUserDocs(docsResult.folders as DocumentFolder[]);
          } else {
            setUserDocs([]);
          }
        }
      } else {
        // Fallback to basic chat info if detailed fetch fails
        setSelectedChat(chat as any);
      }
    } catch (error) {
      console.error("Error fetching chat details:", error);
      // Fallback to basic chat info
      setSelectedChat(chat as any);
    }
    
    if (socket) {
      socket.emit("get_chat_history", { chatId: chat.id });
    } else {
       clearTimeout(loadingTimeout);
       setIsLoadingChat(false);
    }
  }

  const handleCreateTicket = (ticketingSystem: "osticket" | "hubspot") => {
    if (!selectedChat) return
    
    const { user } = selectedChat
    const subject = `Support request from ${user.name}`
    const message = `User ${user.name} (${user.email}) requires assistance with tax drafting.`
    const nameParts = user.name?.split(' ') || ['User']

    startTransition(async () => {
      let res;
      if (ticketingSystem === 'osticket') {
        res = await createOsTicket({
          name: user.name || "N/A",
          email: user.email || "N/A",
          subject,
          message
        })
      } else {
        res = await createHubspotTicket({
            firstname: nameParts[0],
            lastname: nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'N/A',
            email: user.email || "N/A",
            phone: user.phoneNumber,
            subject,
            message
        })
      }

      if (res.success) {
        toast({ title: "Ticket Created", description: `Ticket #${res.ticketId} created in ${ticketingSystem}.`})
      } else {
        toast({ title: "Error", description: res.error })
      }
    })
  }

  const handleSendMessage = () => {
    if (!message.trim() || !selectedChat || !socket || !isAuthenticated || !adminDetails) return

    // Send the correct payload expected by the server
    socket.emit("send_message", {
      chatId: selectedChat.id,
      content: message.trim()
    })

    setMessage("")
    
    // Force scroll to bottom when user sends a message
    scrollToBottom()
  }

  const handleTyping = () => {
    if (!selectedChat || !socket || !isAuthenticated || !adminDetails) return

    socket.emit("start_typing", {
      roomCode: selectedChat.socketIORoomId,
      senderId: adminDetails.id
    })

    if (typingTimeout) {
      clearTimeout(typingTimeout)
    }

    const timeout = setTimeout(() => {
      socket.emit("stop_typing", {
        roomCode: selectedChat.socketIORoomId,
        senderId: adminDetails.id
      })
    }, 1000)

    setTypingTimeout(timeout)
  }

  if (isLoading) {
    return (
      <div className="h-[80vh] flex items-center justify-center bg-white/5 backdrop-blur-sm border border-white/20 rounded-lg">
        <div className="text-center text-white/80 p-8">
          <Loader2 className="animate-spin mx-auto h-12 w-12 mb-4 text-primary" />
          <h2 className="text-xl font-semibold text-white">Loading...</h2>
          <p className="text-white/70">Please wait while we authenticate and load the chat data.</p>
        </div>
      </div>
    )
  }

  if (!adminDetails) {
    return (
      <div className="h-[80vh] flex items-center justify-center bg-white/5 backdrop-blur-sm border border-white/20 rounded-lg">
        <div className="text-center text-white/80 p-8">
          <Power className="mx-auto h-12 w-12 mb-4 text-red-400" />
          <h2 className="text-xl font-semibold text-white">Authentication Required</h2>
          <p className="text-white/70">Please log in as an admin to access the chat dashboard.</p>
        </div>
      </div>
    )
  }

  if (chats.length === 0) {
    return (
      <div className="h-[80vh] flex items-center justify-center bg-white/5 backdrop-blur-sm border border-white/20 rounded-lg">
        <div className="text-center text-white/80 p-8">
          <MessageSquare className="mx-auto h-12 w-12 mb-4 text-primary" />
          <h2 className="text-xl font-semibold text-white">No Active Chats</h2>
          <p className="text-white/70">When a user starts a new conversation, it will appear here.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-[80vh] flex flex-col bg-white/5 backdrop-blur-sm border border-white/20 rounded-lg overflow-hidden">
      <div className="p-0 grid grid-cols-1 md:grid-cols-4 h-full min-h-0">
        {/* Chat List Sidebar */}
        <div className="col-span-1 border-r border-white/20 flex flex-col bg-white/5 h-full min-h-0">
          <div className="p-4 border-b border-white/20 flex flex-col justify-center h-28">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">Chats</h2>
              {/* Add any header controls here, e.g., filters */}
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-white/60" />
              <Input 
                placeholder="Search chats..." 
                className="pl-8 bg-white/10 border-white/20 text-white placeholder:text-white/60 focus:border-primary" 
              />
            </div>
          </div>
          <div className="flex-1 h-full min-h-0 overflow-y-auto scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
            {chats.length === 0 ? (
              <div className="text-center text-white/60 py-8">No previous chat history</div>
            ) : (
              chats.map(chat => {
                const isNewRequest = chat.status === 'PENDING' && !chat.adminId;
                const isReopened = chat.status === 'CLOSED' && chat.closedAt && 
                  (new Date().getTime() - new Date(chat.closedAt).getTime()) < 24 * 60 * 60 * 1000;
                const isAssignedToMe = chat.adminId && currentAdminId && chat.adminId === currentAdminId;
                const isJoined = joinedRooms.includes(chat.socketIORoomId) && selectedChat?.id === chat.id;
                const userName = chat.user && chat.user.name ? chat.user.name : (chat.user && chat.user.email ? chat.user.email : (chat.user && chat.user.phoneNumber ? chat.user.phoneNumber : 'User'));
                const userInitial = userName[0] || 'U';
                const lastMessage = chat.messages && chat.messages[0] ? chat.messages[0].content : '';
                
                return (
                  <div
                    key={chat.id}
                    onClick={async () => {
                      if (isJoined) {
                        await handleSelectChat(chat)
                      } else {
                        await handleJoinRoom(chat)
                      }
                    }}
                    className={cn(
                      "p-3 border-b border-white/10 flex items-start gap-3 cursor-pointer hover:bg-white/10 transition-all duration-200",
                      {
                        "bg-white/15": selectedChat?.id === chat.id,
                        "border-l-4 border-l-orange-500 bg-orange-500/10": isNewRequest,
                        "border-l-4 border-l-blue-500 bg-blue-500/10": isReopened,
                        "border-l-4 border-l-green-500 bg-green-500/10": isAssignedToMe && chat.status === 'ACTIVE'
                      }
                    )}
                  >
                    <Avatar className="mt-1">
                      <AvatarFallback className="bg-white/20 text-white">{userInitial}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between mb-1">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-white truncate">{chat.chatName || 'Chat'}</p>
                          <p className="text-sm text-white/70 truncate">{userName}</p>
                        </div>
                        <span className="text-xs text-white/60 whitespace-nowrap ml-2">
                          {chat.lastMessageAt ? formatSidebarTimestamp(chat.lastMessageAt) : formatSidebarTimestamp(chat.createdAt)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-white/60 capitalize">
                            {chat.chatType.replace(/([A-Z])/g, ' $1').trim()}
                          </span>
                          <span className={cn(
                            "text-xs px-2 py-0.5 rounded-full font-medium",
                            {
                              "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30": chat.status === 'PENDING',
                              "bg-green-500/20 text-green-300 border border-green-500/30": chat.status === 'ACTIVE',
                              "bg-red-500/20 text-red-300 border border-red-500/30": chat.status === 'CLOSED',
                              "bg-gray-500/20 text-gray-300 border border-gray-500/30": chat.status === 'ARCHIVED'
                            }
                          )}>
                            {chat.status}
                          </span>
                          {isNewRequest && (
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-orange-500/20 text-orange-300 border border-orange-500/30">
                              NEW
                            </span>
                          )}
                          {isReopened && (
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-500/20 text-blue-300 border border-blue-500/30">
                              REOPENED
                            </span>
                          )}
                        </div>

                        {!isJoined && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-auto px-3 py-1 text-sm bg-primary text-primary-foreground hover:bg-primary/90"
                            onClick={(e) => { e.stopPropagation(); handleJoinRoom(chat); }}
                          >
                            Join
                          </Button>
                        )}
                        {isJoined && selectedChat?.id === chat.id && (
                          <span className="text-xs font-semibold text-green-400">Joined</span>
                        )}
                      </div>

                      {lastMessage && (
                        <p className="text-sm text-white/70 truncate mt-1">
                          {lastMessage}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className={cn("flex flex-col bg-white/5 h-full min-h-0", selectedChat ? "col-span-2" : "col-span-3")}>
          {isLoadingChat ? (
            <div className="flex items-center justify-center h-full text-white/80">
              <div className="text-center">
                <Loader2 className="animate-spin mx-auto h-8 w-8 mb-4 text-primary" />
                <p className="text-lg text-white">Loading chat...</p>
                <p className="text-sm text-white/70">Please wait while we load the conversation</p>
              </div>
            </div>
          ) : selectedChat && joinedRooms.includes(selectedChat.socketIORoomId) ? (
            <>
              <div className="p-4 border-b border-white/20 flex items-center justify-between bg-white/5 h-28">
                <div className="flex items-center gap-4">
                  <Avatar>
                    <AvatarFallback className="bg-white/20 text-white">{(selectedChat.user && selectedChat.user.name ? selectedChat.user.name[0] : "U")}</AvatarFallback>
                  </Avatar>
                  <div>
                    <h2 className="font-semibold text-white">{selectedChat.chatName || "Chat"}</h2>
                    <div className="text-xs text-white/70">
                      {selectedChat.user ? (selectedChat.user.name || selectedChat.user.email || selectedChat.user.phoneNumber) : "User"}
                    </div>
                    <p className="text-xs text-white/60 capitalize">
                      {selectedChat.chatType.replace(/([A-Z])/g, ' $1').trim()}
                    </p>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="bg-slate-800 border-white/20">
                    <DropdownMenuItem className="text-white hover:bg-white/10">Close Chat</DropdownMenuItem>
                    <DropdownMenuItem className="text-white hover:bg-white/10">Archive Chat</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="flex-1 h-full min-h-0 p-6 overflow-y-auto space-y-6 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent" 
                   style={{ minHeight: 0 }}>
                {/* Message bubbles */}
                {messages.length === 0 ? (
                  <div className="text-center text-white/60 py-8">
                    <p>No messages yet</p>
                    <p className="text-xs">Messages will appear here once the conversation starts</p>
                  </div>
                ) : (
                  messages.map(msg => (
                    <div
                      key={msg.id}
                      className={cn("flex items-end gap-3", {
                        "justify-end": msg.isAdmin,
                      })}
                    >
                      {!msg.isAdmin && (
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-white/20 text-white">{(selectedChat.user && selectedChat.user.name ? selectedChat.user.name[0] : "U")}</AvatarFallback>
                        </Avatar>
                      )}
                      <div
                        className={cn(
                          "max-w-xs md:max-w-md lg:max-w-lg p-3 rounded-lg",
                          {
                            "bg-primary text-white": msg.isAdmin,
                            "bg-white/15 text-white border border-white/20": !msg.isAdmin,
                          }
                        )}
                      >
                        <p className="text-sm">{msg.content}</p>
                        <span className="text-xs text-white/60 mt-1 block text-right">
                          {formatTimestamp(msg.createdAt)}
                        </span>
                      </div>
                      {msg.isAdmin && (
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-primary text-white">A</AvatarFallback>
                        </Avatar>
                      )}
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>
              <div className="p-4 border-t border-white/20 bg-white/5">
                {isTyping && <p className="text-xs text-white/60 mb-2">User is typing...</p>}
                <div className="relative">
                  <Input
                    placeholder="Type your message..."
                    value={message}
                    onChange={(e) => {
                      setMessage(e.target.value)
                      handleTyping()
                    }}
                    onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
                    className="pr-12 bg-white/10 border-white/20 text-white placeholder:text-white/60 focus:border-primary"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-white hover:bg-white/10"
                    onClick={handleSendMessage}
                    disabled={!message.trim()}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-white/80">
              <div className="text-center">
                <MessageSquare className="mx-auto h-16 w-16 mb-4 text-primary" />
                <p className="text-lg text-white">Select a chat and join the room to start messaging</p>
              </div>
            </div>
          )}
        </div>
        
        {/* Agent Panel - Only visible when chat is selected */}
        {selectedChat && (
          <div className="col-span-1 border-l border-white/20 flex flex-col bg-white/5">
            <div className="p-4 border-b border-white/20 text-center bg-white/5 flex items-center justify-center h-28">
              <h2 className="text-xl font-bold text-white">Agent Panel</h2>
            </div>
            {isLoadingChat ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="animate-spin h-8 w-8 text-primary" />
              </div>
            ) : (
              <>
                {isPending && <Loader2 className="animate-spin m-auto text-primary" />}
                {!isPending && (
                  <div className="p-4 space-y-6 flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
                    {/* User Info */}
                    <div className="space-y-2">
                      <h3 className="font-semibold text-white">User Information</h3>
                      <div className="space-y-1 text-sm">
                        <p className="text-white/80"><strong className="text-white">Name:</strong> {selectedChat.user?.name || "Not provided"}</p>
                        <p className="text-white/80"><strong className="text-white">Email:</strong> {selectedChat.user?.email || "Not provided"}</p>
                        <p className="text-white/80"><strong className="text-white">Phone:</strong> {selectedChat.user?.phoneNumber || "Not provided"}</p>
                        <p className="text-white/80"><strong className="text-white">Plan:</strong> {selectedChat.user?.Subscription?.planName || "No active plan"}</p>
                      </div>
                    </div>

                    {/* Ticketing */}
                    <div className="space-y-2">
                      <h3 className="font-semibold text-white">Create Ticket</h3>
                      <div className="flex flex-col space-y-2">
                          <Button 
                            onClick={() => handleCreateTicket('hubspot')}
                            className="bg-white/10 hover:bg-white/20 text-white border border-white/20"
                          >
                            <Ticket className="mr-2 h-4 w-4"/>HubSpot
                          </Button>
                          <Button 
                            onClick={() => handleCreateTicket('osticket')}
                            className="bg-white/10 hover:bg-white/20 text-white border border-white/20"
                          >
                            <Ticket className="mr-2 h-4 w-4"/>osTicket
                          </Button>
                      </div>
                    </div>

                    {/* Documents */}
                    <div className="space-y-2">
                      <h3 className="font-semibold text-white">Uploaded Documents</h3>
                      <div className="space-y-2">
                          {userDocs.length > 0 ? userDocs.map(folder => (
                              <div key={folder.id}>
                                  <h4 className="font-medium text-sm text-white">{folder.name}</h4>
                                  {folder.File.length > 0 ? folder.File.map(file => (
                                      <a key={file.id} href={`https://hykxpxglhoyjbodkvoxx.supabase.co/storage/v1/object/public/documents/${file.storageName}`} target="_blank" rel="noopener noreferrer" className="flex items-center text-sm text-primary hover:text-primary/80 transition-colors">
                                          <FileText className="mr-2 h-4 w-4"/>
                                          {file.originalName}
                                      </a>
                                  )) : <p className="text-sm text-white/60">No Files in this folder</p>}
                              </div>
                          )) : <p className="text-sm text-white/60">No documents uploaded.</p>}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
      <Toaster />
    </div>
  )
}