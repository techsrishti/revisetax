"use client"

import { useEffect, useState, useTransition } from "react"
import { io } from "socket.io-client"
import { getAdminChats } from "../actions"
import {
  getChatDetails,
  getUserDocuments,
  toggleAiChat,
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
  Bot,
  User,
  Power,
  Loader2,
  MessageSquare,
  Files,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Toaster } from "@/components/ui/toaster"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"

interface BaseChat {
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

  useEffect(() => {
    const fetchChats = async () => {
      const response = await getAdminChats()
      if (response.success && Array.isArray(response.chats)) {
        const augmentedChats = response.chats.map(c => ({ ...c, isAiChat: c.isAiChat || false }))
        setChats(augmentedChats)
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
            user: {
              name: name || "Anonymous",
              email: null,
              phoneNumber: "unknown"
            },
            updatedAt: new Date(),
            chatType: "anonymous",
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
    })
  }

  const handleToggleAiChat = async () => {
    if (!selectedChat) return
    startTransition(async () => {
      const res = await toggleAiChat(selectedChat.id, !selectedChat.isAiChat)
      if (res.success) {
        setSelectedChat(prev => prev ? { ...prev, isAiChat: !prev.isAiChat } : null)
        toast({ title: "Success", description: `AI Chat has been ${!selectedChat.isAiChat ? "enabled" : "disabled"}.` })
      } else {
        toast({ title: "Error", description: res.error })
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

  if (chats.length === 0) {
    return (
      <Card className="h-[80vh] flex items-center justify-center rounded-none border-0 md:border-x">
        <div className="text-center text-muted-foreground p-8">
          <MessageSquare className="mx-auto h-12 w-12 mb-4" />
          <h2 className="text-xl font-semibold">No Active Chats</h2>
          <p>When a user starts a new conversation, it will appear here.</p>
        </div>
      </Card>
    )
  }

  return (
    <Card className="h-[80vh] flex flex-col rounded-none border-0 md:border-x">
      <CardContent className="p-0 grid grid-cols-1 md:grid-cols-4 h-full">
        {/* Chat List Sidebar */}
        <div className="col-span-1 border-r flex flex-col">
          <div className="p-4 border-b">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Chats</h2>
              {/* Add any header controls here, e.g., filters */}
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search chats..." className="pl-8" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {chats.map(chat => (
              <div
                key={chat.id}
                className={cn(
                  "p-4 border-b flex items-start gap-4 cursor-pointer hover:bg-gray-50",
                  { "bg-gray-100": selectedChat?.id === chat.id }
                )}
                onClick={() => handleSelectChat(chat)}
              >
                <Avatar>
                  <AvatarFallback>{(chat.user.name || "U")[0]}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">
                      {chat.user.name || chat.user.email || chat.user.phoneNumber}
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      {formatTimestamp(chat.updatedAt)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground capitalize">
                    {chat.chatType.replace(/([A-Z])/g, ' $1').trim()}
                  </p>
                  {chat.messages[0] && (
                    <p className="text-sm text-muted-foreground truncate mt-1">
                      {chat.messages[0].content}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Chat Area */}
        <div className="col-span-2 flex flex-col">
          {selectedChat ? (
            <>
              <div className="p-4 border-b flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Avatar>
                    <AvatarFallback>{(selectedChat.user.name || "U")[0]}</AvatarFallback>
                  </Avatar>
                  <div>
                    <h2 className="font-semibold">{selectedChat.user.name || selectedChat.user.email || selectedChat.user.phoneNumber}</h2>
                    <p className="text-xs text-muted-foreground capitalize">
                      {selectedChat.chatType.replace(/([A-Z])/g, ' $1').trim()}
                    </p>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem>Close Chat</DropdownMenuItem>
                    <DropdownMenuItem>Archive Chat</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="flex-1 p-6 overflow-y-auto space-y-6">
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
                        <AvatarFallback>{(selectedChat.user.name || "U")[0]}</AvatarFallback>
                      </Avatar>
                    )}
                    <div
                      className={cn(
                        "max-w-xs md:max-w-md lg:max-w-lg p-3 rounded-lg",
                        {
                          "bg-primary text-primary-foreground": msg.isAdmin,
                          "bg-gray-100": !msg.isAdmin,
                        }
                      )}
                    >
                      <p className="text-sm">{msg.content}</p>
                      <span className="text-xs text-muted-foreground/80 mt-1 block text-right">
                        {format(new Date(msg.createdAt), "h:mm a")}
                      </span>
                    </div>
                    {msg.isAdmin && (
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>A</AvatarFallback>
                      </Avatar>
                    )}
                  </div>
                ))}
              </div>
              <div className="p-4 border-t">
                {isTyping && <p className="text-xs text-muted-foreground mb-2">User is typing...</p>}
                <div className="relative">
                  <Input
                    placeholder="Type your message..."
                    value={message}
                    onChange={(e) => {
                      setMessage(e.target.value)
                      handleTyping()
                    }}
                    onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
                    className="pr-12"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                    onClick={handleSendMessage}
                    disabled={!message.trim()}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="col-span-3 flex items-center justify-center h-full text-muted-foreground bg-gray-50/50">
              <div className="text-center">
                <MessageSquare className="mx-auto h-16 w-16 mb-4" />
                <p className="text-lg">Select a chat to start messaging</p>
              </div>
            </div>
          )}
        </div>
        
        {/* Agent Panel */}
        <div className="col-span-1 border-l flex flex-col">
          <div className="p-4 border-b text-center">
            <h2 className="text-xl font-bold">Agent Panel</h2>
          </div>
          {isPending && <Loader2 className="animate-spin m-auto" />}
          {selectedChat && !isPending && (
            <div className="p-4 space-y-6 flex-1 overflow-y-auto">
              {/* User Info */}
              <div className="space-y-2">
                <h3 className="font-semibold">User Information</h3>
                <p className="text-sm"><strong>Plan:</strong> {selectedChat.user.Subscription?.planName || "No active plan"}</p>
              </div>

              {/* AI Chat Toggle */}
              <div className="space-y-2">
                <h3 className="font-semibold">AI Assistant</h3>
                <div className="flex items-center space-x-2">
                    <Switch
                        id="ai-chat-toggle"
                        checked={selectedChat.isAiChat}
                        onCheckedChange={handleToggleAiChat}
                    />
                    <Label htmlFor="ai-chat-toggle">{selectedChat.isAiChat ? "AI Active" : "AI Inactive"}</Label>
                </div>
              </div>

              {/* Ticketing */}
              <div className="space-y-2">
                <h3 className="font-semibold">Create Ticket</h3>
                <div className="flex flex-col space-y-2">
                    <Button onClick={() => handleCreateTicket('hubspot')}><Ticket className="mr-2 h-4 w-4"/>HubSpot</Button>
                    <Button onClick={() => handleCreateTicket('osticket')}><Ticket className="mr-2 h-4 w-4"/>osTicket</Button>
                </div>
              </div>

              {/* Documents */}
              <div className="space-y-2">
                <h3 className="font-semibold">Uploaded Documents</h3>
                <div className="space-y-2">
                    {userDocs.length > 0 ? userDocs.map(folder => (
                        <div key={folder.id}>
                            <h4 className="font-medium text-sm">{folder.name}</h4>
                            {folder.File.map(file => (
                                <a key={file.id} href={`/path/to/documents/${file.storageName}`} target="_blank" rel="noopener noreferrer" className="flex items-center text-sm text-blue-600 hover:underline">
                                    <FileText className="mr-2 h-4 w-4"/>
                                    {file.originalName}
                                </a>
                            ))}
                        </div>
                    )) : <p className="text-sm text-muted-foreground">No documents uploaded.</p>}
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
      <Toaster />
    </Card>
  )
} 