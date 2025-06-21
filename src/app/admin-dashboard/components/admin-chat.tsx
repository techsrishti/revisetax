"use client"

import { useEffect, useState, useTransition } from "react"
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
  updatedAt: Date
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
  isAiChat: boolean
}

interface ChatDetails extends Chat {
  isAiChat: boolean
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

const formatTimestamp = (date: Date) => {
  const d = new Date(date)
  if (isToday(d)) {
    return format(d, "h:mm a")
  }
  if (isYesterday(d)) {
    return "Yesterday"
  }
  return format(d, "MMM d, yyyy")
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

  useEffect(() => {
    const fetchChats = async () => {
      try {
        setIsLoading(true)
        const response = await getAdminChats()
        if (response.success && Array.isArray(response.chats)) {
          const augmentedChats = response.chats.map(c => ({ ...c, isAiChat: c.isAiChat || false }))
          setChats(augmentedChats)
          
          // Extract current admin ID from the first chat that has an admin (if any)
          const adminChat = augmentedChats.find(chat => chat.adminId && chat.admin);
          if (adminChat?.admin?.id) {
            setCurrentAdminId(adminChat.admin.id);
          }
        }
      } catch (error) {
        console.error("Error fetching chats:", error)
        toast({ title: "Error", description: "Failed to load chats.", variant: "destructive" })
      } finally {
        setIsLoading(false)
      }
    }

    fetchChats()

    // Initialize socket connection
    const socketInstance = io("http://18.60.99.199:3001")
    socketInstance.emit("identify_as_admin", { adminId: "admin_1" })
    setSocket(socketInstance)

    return () => {
      socketInstance.disconnect()
    }
  }, [toast])

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
      const { roomCode, userId, name } = msgPayload
    
      setChats(prevChats => {
        const existingChatIndex = prevChats.findIndex(chat => chat.socketIORoomId === roomCode)
    
        if (existingChatIndex !== -1) {
          // Chat already exists → Move it to the top
          const updatedChat = prevChats[existingChatIndex]
          const newOrder = [updatedChat, ...prevChats.filter((_, i) => i !== existingChatIndex)]
          return newOrder
        } else {
          // New chat → Create and add it to the top
          const newChat: Chat = {
            id: roomCode,
            chatName: name || "Anonymous",
            socketIORoomId: roomCode,
            userId,
            adminId: null,
            user: {
              name: name || "Anonymous",
              email: null,
              phoneNumber: "unknown"
            },
            updatedAt: new Date(),
            chatType: "anonymous",
            status: "active",
            closedAt: null,
            closedBy: null,
            closeReason: null,
            isActive: true,
            messages: [],
            isAiChat: false
          }
    
          return [newChat, ...prevChats]
        }
      })
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

  const handleSelectChat = async (chat: Chat) => {
    startTransition(async () => {
      setSelectedChat(null) // Clear previous selection immediately
      setUserDocs([]) // Clear docs
      setIsLoadingChat(true) // Start loading
      
      try {
        // If this is a PENDING chat and not assigned to anyone, assign it to current admin
        if (chat.status === 'PENDING' && !chat.adminId && currentAdminId) {
          const assignResult = await assignChatToAdmin(chat.id, currentAdminId)
          if (assignResult.success && assignResult.chat) {
            // Update the chat in the local state
            setChats(prevChats => 
              prevChats.map(c => 
                c.id === chat.id 
                  ? { ...c, adminId: currentAdminId, status: 'ACTIVE', admin: assignResult.chat.admin }
                  : c
              )
            )
            toast({ title: "Success", description: "Chat assigned to you." })
          } else {
            toast({ title: "Error", description: "Failed to assign chat.", variant: "destructive" })
            setIsLoadingChat(false)
            return
          }
        }
        
        const detailsRes = await getChatDetails(chat.id)
        if (detailsRes.success && detailsRes.chat) {
          // Manually add the isAiChat property to satisfy the ChatDetails type
          const chatDetails: ChatDetails = {
              ...(detailsRes.chat as any), // Use 'as any' to bypass strict checks here
              isAiChat: (detailsRes.chat as any).isAiChat || false
          }
          setSelectedChat(chatDetails)
          
          // Also fetch user documents
          const docsRes = await getUserDocuments(detailsRes.chat.userId)
          if(docsRes.success && docsRes.folders) {
            setUserDocs(docsRes.folders)
          }
        } else {
          toast({ title: "Error", description: "Could not load chat details.", variant: "destructive" })
        }
      } catch (error) {
        console.error("Error in handleSelectChat:", error)
        toast({ title: "Error", description: "Failed to process chat selection.", variant: "destructive" })
      } finally {
        setIsLoadingChat(false) // End loading
      }
    })
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

  if (isLoading) {
    return (
      <div className="h-[80vh] flex items-center justify-center bg-white/5 backdrop-blur-sm border border-white/20 rounded-lg">
        <div className="text-center text-white/80 p-8">
          <Loader2 className="animate-spin mx-auto h-12 w-12 mb-4 text-primary" />
          <h2 className="text-xl font-semibold text-white">Loading...</h2>
          <p className="text-white/70">Please wait while we load the chat data.</p>
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
      <div className="p-0 grid grid-cols-1 md:grid-cols-4 h-full">
        {/* Chat List Sidebar */}
        <div className="col-span-1 border-r border-white/20 flex flex-col bg-white/5">
          <div className="p-4 border-b border-white/20">
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
          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
            {chats.map(chat => {
              const isNewRequest = chat.status === 'PENDING' && !chat.adminId;
              const isReopened = chat.status === 'CLOSED' && chat.closedAt && 
                (new Date().getTime() - new Date(chat.closedAt).getTime()) < 24 * 60 * 60 * 1000;
              const isAssignedToMe = chat.adminId && currentAdminId && chat.adminId === currentAdminId;
              
              return (
                <div
                  key={chat.id}
                  className={cn(
                    "p-4 border-b border-white/10 flex items-start gap-4 cursor-pointer hover:bg-white/10 transition-all duration-200",
                    { 
                      "bg-white/15": selectedChat?.id === chat.id,
                      "border-l-4 border-l-orange-500 bg-orange-500/10": isNewRequest,
                      "border-l-4 border-l-blue-500 bg-blue-500/10": isReopened,
                      "border-l-4 border-l-green-500 bg-green-500/10": isAssignedToMe && chat.status === 'ACTIVE'
                    }
                  )}
                  onClick={() => handleSelectChat(chat)}
                >
                  <Avatar>
                    <AvatarFallback className="bg-white/20 text-white">{(chat.user.name || "U")[0]}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-semibold truncate text-white">
                        {chat.user.name || chat.user.email || chat.user.phoneNumber}
                      </h3>
                      <span className="text-xs text-white/60">
                        {formatTimestamp(chat.updatedAt)}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-white/60 capitalize">
                        {chat.chatType.replace(/([A-Z])/g, ' $1').trim()}
                      </span>
                      
                      {/* Status Badge */}
                      <span className={cn(
                        "text-xs px-2 py-1 rounded-full font-medium",
                        {
                          "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30": chat.status === 'PENDING',
                          "bg-green-500/20 text-green-300 border border-green-500/30": chat.status === 'ACTIVE',
                          "bg-red-500/20 text-red-300 border border-red-500/30": chat.status === 'CLOSED',
                          "bg-gray-500/20 text-gray-300 border border-gray-500/30": chat.status === 'ARCHIVED'
                        }
                      )}>
                        {chat.status}
                      </span>
                      
                      {/* Special badges */}
                      {isNewRequest && (
                        <span className="text-xs px-2 py-1 rounded-full font-medium bg-orange-500/20 text-orange-300 border border-orange-500/30">
                          NEW
                        </span>
                      )}
                      {isReopened && (
                        <span className="text-xs px-2 py-1 rounded-full font-medium bg-blue-500/20 text-blue-300 border border-blue-500/30">
                          REOPENED
                        </span>
                      )}
                    </div>
                    
                    {/* Admin assignment info */}
                    {chat.admin && (
                      <p className="text-xs text-white/60 mb-1">
                        Assigned to: {chat.admin.name}
                      </p>
                    )}
                    
                    {/* Last message preview */}
                    {chat.messages[0] && (
                      <p className="text-sm text-white/70 truncate">
                        {chat.messages[0].content}
                      </p>
                    )}
                    
                    {/* Close reason for closed chats */}
                    {chat.status === 'CLOSED' && chat.closeReason && (
                      <p className="text-xs text-red-400 mt-1">
                        Closed: {chat.closeReason}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chat Area */}
        <div className={cn("flex flex-col bg-white/5", selectedChat ? "col-span-2" : "col-span-3")}>
          {isLoadingChat ? (
            <div className="flex items-center justify-center h-full text-white/80">
              <div className="text-center">
                <Loader2 className="animate-spin mx-auto h-8 w-8 mb-4 text-primary" />
                <p className="text-lg text-white">Loading chat...</p>
                <p className="text-sm text-white/70">Please wait while we load the conversation</p>
              </div>
            </div>
          ) : selectedChat ? (
            <>
              <div className="p-4 border-b border-white/20 flex items-center justify-between bg-white/5">
                <div className="flex items-center gap-4">
                  <Avatar>
                    <AvatarFallback className="bg-white/20 text-white">{(selectedChat.user.name || "U")[0]}</AvatarFallback>
                  </Avatar>
                  <div>
                    <h2 className="font-semibold text-white">{selectedChat.user.name || selectedChat.user.email || selectedChat.user.phoneNumber}</h2>
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
              <div className="flex-1 p-6 overflow-y-auto space-y-6 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
                {/* Message bubbles */}
                {selectedChat.messages.slice().reverse().map(msg => (
                  <div
                    key={msg.id}
                    className={cn("flex items-end gap-3", {
                      "justify-end": msg.isAdmin,
                    })}
                  >
                    {!msg.isAdmin && (
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-white/20 text-white">{(selectedChat.user.name || "U")[0]}</AvatarFallback>
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
                        {format(new Date(msg.createdAt), "h:mm a")}
                      </span>
                    </div>
                    {msg.isAdmin && (
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-primary text-white">A</AvatarFallback>
                      </Avatar>
                    )}
                  </div>
                ))}
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
                <p className="text-lg text-white">Select a chat to start messaging</p>
              </div>
            </div>
          )}
        </div>
        
        {/* Agent Panel - Only visible when chat is selected */}
        {selectedChat && (
          <div className="col-span-1 border-l border-white/20 flex flex-col bg-white/5">
            <div className="p-4 border-b border-white/20 text-center bg-white/5">
              <h2 className="text-xl font-bold text-white">Agent Panel</h2>
            </div>
            {isPending && <Loader2 className="animate-spin m-auto text-primary" />}
            {!isPending && (
              <div className="p-4 space-y-6 flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
                {/* User Info */}
                <div className="space-y-2">
                  <h3 className="font-semibold text-white">User Information</h3>
                  <div className="space-y-1 text-sm">
                    <p className="text-white/80"><strong className="text-white">Name:</strong> {selectedChat.user.name || "Not provided"}</p>
                    <p className="text-white/80"><strong className="text-white">Email:</strong> {selectedChat.user.email || "Not provided"}</p>
                    <p className="text-white/80"><strong className="text-white">Phone:</strong> {selectedChat.user.phoneNumber || "Not provided"}</p>
                    <p className="text-white/80"><strong className="text-white">Plan:</strong> {selectedChat.user.Subscription?.planName || "No active plan"}</p>
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
          </div>
        )}
      </div>
      <Toaster />
    </div>
  )
} 