"use client"

import { useEffect, useState, useTransition, useRef } from "react"
import { io } from "socket.io-client"
import { getAdminStatus, updateAdminStatus } from "../actions"
import {
  getChatDetails,
  getUserDocuments,
  assignChatToAdmin,
  createOsTicket,
  createHubspotTicket,
  getUserOsTickets,
} from "../actions/chat-panel"
import { refineMessageWithAI } from "../actions/ai-refine"
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  Wifi,
  WifiOff,
  ToggleLeft,
  ToggleRight,
  Sparkles,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Toaster } from "@/components/ui/toaster"
import AdminFileViewer from '@/components/AdminFileViewer'
import OsTicketDialog from './os-ticket-dialog'

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
  userName?: string
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

interface OsTicket {
  id: string
  osTicketId: string
  details: any
  createdAt: Date
  updatedAt: Date
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
  const [userOsTickets, setUserOsTickets] = useState<OsTicket[]>([])
  const [message, setMessage] = useState("")
  const [socket, setSocket] = useState<any>(null)
  const [isTyping, setIsTyping] = useState(false)
  const [typingTimeout, setTypingTimeout] = useState<NodeJS.Timeout | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [currentAdminId, setCurrentAdminId] = useState<string | null>(null)
  const [isLoadingChat, setIsLoadingChat] = useState(false)
  const [isLoadingOsTickets, setIsLoadingOsTickets] = useState(false)
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false)
  const [messages, setMessages] = useState<any[]>([])
  const [joinedRooms, setJoinedRooms] = useState<string[]>([])
  const [adminDetails, setAdminDetails] = useState<AdminDetails | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const selectedChatRef = useRef(selectedChat)
  const messagesContainerRef = useRef<HTMLDivElement | null>(null)
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)
  const [isClosingChat, setIsClosingChat] = useState(false)
  const [isArchivingChat, setIsArchivingChat] = useState(false)
  const [showOsTicketDialog, setShowOsTicketDialog] = useState(false)
  
  // New state for admin status
  const [adminIsOnline, setAdminIsOnline] = useState<boolean>(true)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [showStatusDialog, setShowStatusDialog] = useState(false)
  const [pendingStatusChange, setPendingStatusChange] = useState<boolean | null>(null)
  const [showWindowCloseDialog, setShowWindowCloseDialog] = useState(false)
  const [pendingUnloadEvent, setPendingUnloadEvent] = useState<BeforeUnloadEvent | null>(null)

  // AI refinement state
  const [isRefiningMessage, setIsRefiningMessage] = useState(false)

  useEffect(() => {
    selectedChatRef.current = selectedChat
  }, [selectedChat])

  // Handle page unload - mandatory offline toggle and auto-offline if user stays
  useEffect(() => {
    let unloadAttempted = false;
    let offlineTimeout: NodeJS.Timeout | null = null;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (adminIsOnline) {
        e.preventDefault();
        e.returnValue = '';
        setShowWindowCloseDialog(true);
        setPendingUnloadEvent(e);
        return '';
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        unloadAttempted = false;
        if (offlineTimeout) clearTimeout(offlineTimeout);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (offlineTimeout) clearTimeout(offlineTimeout);
    };
  }, [adminIsOnline]);

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
        const socketInstance = io("https://socket.alpha.revisetax.com")
        setSocket(socketInstance)

        // Set a timeout to stop loading if socket doesn't respond
        const loadingTimeout = setTimeout(() => {
          console.warn('Socket loading timeout - stopping loading state')
          setIsLoading(false)
        }, 10000) // 10 second timeout

        // Authenticate admin on connect
        socketInstance.on("connect", () => {
          socketInstance.emit("admin_authenticate", { 
            adminId: admin.id, 
            adminEmail: admin.email 
          })
        })

        // Listen for authentication success
        socketInstance.on("admin_authenticated", (data: any) => {
          setIsAuthenticated(true)
          // Admin is automatically set to online when they authenticate
          setAdminIsOnline(true)
        })

        // Listen for authentication error
        socketInstance.on("auth_error", (data: any) => {
          setIsAuthenticated(false)
          clearTimeout(loadingTimeout)
          setIsLoading(false)
        })

        // Listen for chat list
        socketInstance.on("existing_admin_chats", (data: any) => {
          clearTimeout(loadingTimeout)
          if (data.chats && Array.isArray(data.chats)) {
            const mappedChats: Chat[] = data.chats.map((c: any) => ({
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

            // Pre-populate joinedRooms with all ACTIVE chats assigned to this admin
            if (adminChat?.admin?.id) {
              const activeAssignedRooms = uniqueChats
                .filter((chat: Chat) => chat.status === "ACTIVE" && chat.adminId === adminChat.admin.id)
                .map((chat: Chat) => chat.socketIORoomId)
              setJoinedRooms(activeAssignedRooms)
            }
          } else {
            setChats([])
          }
          setIsLoading(false)
        })

        // Handle socket connection errors
        socketInstance.on("connect_error", (error: any) => {
          console.error('Socket connection error:', error)
          clearTimeout(loadingTimeout)
          setIsLoading(false)
        })

        socketInstance.on("disconnect", (reason: string) => {
          console.warn('Socket disconnected:', reason)
          clearTimeout(loadingTimeout)
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
              user: {
                name: data.userName || '',
                email: data.userEmail || '',
                phoneNumber: data.userPhoneNumber || ''
              },
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
              userName: data.userName || '',
            }
            
            // Add to beginning of list and sort by most recent
            const updatedChats = [newChat, ...prev];
            const sortedChats = updatedChats.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
            
            return sortedChats;
          })
          
          // Show notification for new chat
          toast({
            title: "New Chat Request",
            description: `New ${data.chatType || 'chat'} request from ${data.userName || 'User'}`,
            variant: "default"
          });
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

        // Listen for chat closed
        socketInstance.on("chat_closed", (data: any) => {
          setChats(prevChats => prevChats.map(chat =>
            chat.id === data.chatId
              ? { ...chat, status: "CLOSED", closedAt: data.closedAt, closeReason: data.reason, closedBy: data.closedBy || "" }
              : chat
          ));
          if (selectedChatRef.current?.id === data.chatId) {
            setSelectedChat(prev => prev ? { ...prev, status: "CLOSED", closedAt: data.closedAt, closeReason: data.reason, closedBy: data.closedBy || "" } : prev)
            toast({ title: "Chat Closed", description: data.reason || "Chat closed.", variant: "default" })
          }
        });

        // Listen for chat archived
        socketInstance.on("chat_archived", (data: any) => {
          setChats(prevChats => prevChats.map(chat =>
            chat.id === data.chatId
              ? { ...chat, status: "ARCHIVED" }
              : chat
          ));
          if (selectedChatRef.current?.id === data.chatId) {
            setSelectedChat(prev => prev ? { ...prev, status: "ARCHIVED" } : prev)
            toast({ title: "Chat Archived", description: "Chat archived successfully.", variant: "default" })
          }
        });

        // Listen for chat reopened by user (admin side)
        socketInstance.on("chat_reopened_admin", (data: any) => {
          setChats(prevChats => prevChats.map(chat =>
            chat.id === data.chatId
              ? { ...chat, status: "ACTIVE" }
              : chat
          ));
          if (selectedChatRef.current?.id === data.chatId) {
            setSelectedChat(prev => prev ? { ...prev, status: "ACTIVE" } : prev);
          }
          toast({ title: "Chat Reopened", description: "This chat has been reopened by the user.", variant: "default" });
        });

        return () => {
          clearTimeout(loadingTimeout)
          socketInstance.disconnect()
          socketInstance.off("chat_closed")
          socketInstance.off("chat_archived")
          socketInstance.off("chat_reopened_admin")
          socketInstance.off("new_chat_request")
          socketInstance.off("new_message")
          socketInstance.off("chat_history")
          socketInstance.off("existing_admin_chats")
          socketInstance.off("admin_authenticated")
          socketInstance.off("auth_error")
          socketInstance.off("connect_error")
          socketInstance.off("disconnect")
        }
      } catch (error) {
        console.error('Error initializing socket:', error)
        setIsLoading(false)
      }
    }

    initializeSocket()
  }, [])

  useEffect(() => {
    // Autoscroll disabled
  }, [messages])

  // Fetch admin status on component mount
  useEffect(() => {
    const fetchAdminStatus = async () => {
      try {
        const result = await getAdminStatus()
        if (result.success) {
          setAdminIsOnline(result.isOnline)
        }
      } catch (error) {
        console.error('Error fetching admin status:', error)
      }
    }

    fetchAdminStatus()
  }, [])

  // Join room handler
  const handleJoinRoom = async (chat: Chat) => {
    if (!socket || !isAuthenticated || !adminDetails) return
    setIsLoadingChat(true)
    socket.emit("admin_join_chat", { chatId: chat.id })
    setJoinedRooms(prev => prev.includes(chat.socketIORoomId) ? prev : [...prev, chat.socketIORoomId]) // Accumulate joined rooms

    // Only update status to ACTIVE if chat was PENDING
    if (chat.status === "PENDING") {
      setChats(prevChats => prevChats.map(c =>
        c.id === chat.id ? { ...c, status: "ACTIVE" } : c
      ))
      setSelectedChat(prev => prev ? { ...prev, status: "ACTIVE" } : prev)
    }

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
        
        // Fetch user documents and osTickets in parallel
        if (detailedChat.userId) {
          setIsLoadingDocuments(true);
          setIsLoadingOsTickets(true);
          
          // Fetch both simultaneously
          Promise.allSettled([
            getUserDocuments(detailedChat.userId),
            getUserOsTickets(detailedChat.userId)
          ]).then(([docsResult, ticketsResult]) => {
            // Handle documents result
            if (docsResult.status === 'fulfilled' && docsResult.value.success && docsResult.value.folders) {
              setUserDocs(docsResult.value.folders as DocumentFolder[]);
            } else {
              setUserDocs([]);
            }
            
            // Handle osTickets result
            if (ticketsResult.status === 'fulfilled' && ticketsResult.value.success) {
              setUserOsTickets(ticketsResult.value.tickets);
            } else {
              setUserOsTickets([]);
            }
          }).catch((error) => {
            console.error('Error fetching user data:', error);
            setUserDocs([]);
            setUserOsTickets([]);
          }).finally(() => {
            setIsLoadingDocuments(false);
            setIsLoadingOsTickets(false);
          });
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

    // Only update status to ACTIVE if chat was PENDING
    if (chat.status === "PENDING") {
      setChats(prevChats => prevChats.map(c =>
        c.id === chat.id ? { ...c, status: "ACTIVE" } : c
      ))
      setSelectedChat(prev => prev ? { ...prev, status: "ACTIVE" } : prev)
    }

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
        
        // Fetch user documents and osTickets in parallel
        if (detailedChat.userId) {
          setIsLoadingDocuments(true);
          setIsLoadingOsTickets(true);
          
          // Fetch both simultaneously
          Promise.allSettled([
            getUserDocuments(detailedChat.userId),
            getUserOsTickets(detailedChat.userId)
          ]).then(([docsResult, ticketsResult]) => {
            // Handle documents result
            if (docsResult.status === 'fulfilled' && docsResult.value.success && docsResult.value.folders) {
              setUserDocs(docsResult.value.folders as DocumentFolder[]);
            } else {
              setUserDocs([]);
            }
            
            // Handle osTickets result
            if (ticketsResult.status === 'fulfilled' && ticketsResult.value.success) {
              setUserOsTickets(ticketsResult.value.tickets);
            } else {
              setUserOsTickets([]);
            }
          }).catch((error) => {
            console.error('Error fetching user data:', error);
            setUserDocs([]);
            setUserOsTickets([]);
          }).finally(() => {
            setIsLoadingDocuments(false);
            setIsLoadingOsTickets(false);
          });
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
    
    if (ticketingSystem === 'osticket') {
      setShowOsTicketDialog(true)
    } else {
      const { user } = selectedChat
      const subject = `Support request from ${user.name}`
      const message = `User ${user.name} (${user.email}) requires assistance with tax drafting.`
      const nameParts = user.name?.split(' ') || ['User']

      startTransition(async () => {
        const res = await createHubspotTicket({
            firstname: nameParts[0],
            lastname: nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'N/A',
            email: user.email || "N/A",
            phone: user.phoneNumber,
            subject,
            message
        })

        if (res.success) {
          toast({ title: "Ticket Created", description: `Ticket #${res.ticketId} created in ${ticketingSystem}.`})
        } else {
          toast({ title: "Error", description: res.error })
        }
      })
    }
  }

  const handleOsTicketSubmit = async (data: {
    name: string
    email: string
    subject: string
    message: string
    attachments: { [key: string]: string }[]
  }) => {
    if (!selectedChat) return

    startTransition(async () => {
      const res = await createOsTicket({
        name: data.name,
        email: data.email,
        subject: data.subject,
        message: data.message,
        userId: selectedChat.userId,
        attachments: data.attachments
      })

      if (res.success) {
        toast({ title: "Ticket Created", description: `Ticket #${res.ticketId} created in osTicket.`})
        // Refresh osTickets
        setIsLoadingOsTickets(true);
        try {
          const ticketsResult = await getUserOsTickets(selectedChat.userId)
          if (ticketsResult.success) {
            setUserOsTickets(ticketsResult.tickets)
          }
        } catch (error) {
          console.error('Error refreshing osTickets:', error);
        } finally {
          setIsLoadingOsTickets(false);
        }
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
    
    // Autoscroll disabled
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


  const handleViewFile = (fileId: string, fileName: string, mimeType: string) => {
    return (
      <AdminFileViewer
        fileId={fileId}
        fileName={fileName}
        mimeType={mimeType}
      />
    );
  };

  // Add handlers for closing and archiving chat
  const handleCloseChat = () => {
    if (!socket || !selectedChat || isClosingChat || selectedChat.status !== "ACTIVE") return
    setIsClosingChat(true)
    socket.emit("close_chat", { chatId: selectedChat.id })
    setTimeout(() => setIsClosingChat(false), 5000) // reset in case no response
  }

  const handleArchiveChat = () => {
    if (!socket || !selectedChat || isArchivingChat || selectedChat.status !== "CLOSED") return
    setIsArchivingChat(true)
    socket.emit("archive_chat", { chatId: selectedChat.id })
    setTimeout(() => setIsArchivingChat(false), 5000)
  }

  // AI refinement handler
  const handleAIRefine = async () => {
    if (!message.trim() || isRefiningMessage) return
    
    setIsRefiningMessage(true)
    try {
      const result = await refineMessageWithAI(message.trim())
      
      if (result.success && result.refinedText) {
        setMessage(result.refinedText)
        toast({
          title: "Message Refined",
          description: "Your message has been refined to be more professional.",
          variant: "default"
        })
      } else {
        toast({
          title: "Refinement Failed",
          description: result.error || "Failed to refine message. Please try again.",
          variant: "destructive"
        })
      }
    } catch (error) {
      console.error('Error refining message:', error)
      toast({
        title: "Error",
        description: "Failed to refine message. Please try again.",
        variant: "destructive"
      })
    } finally {
      setIsRefiningMessage(false)
    }
  }

  // Handle status toggle
  const handleStatusToggle = (newStatus: boolean) => {
    setPendingStatusChange(newStatus)
    setShowStatusDialog(true)
  }

  const confirmStatusChange = async () => {
    if (pendingStatusChange === null) return
    
    setIsUpdatingStatus(true)
    try {
      const result = await updateAdminStatus(pendingStatusChange)
      if (result.success) {
        setAdminIsOnline(result.isOnline)
        toast({
          title: "Status Updated",
          description: `You are now ${result.isOnline ? 'online' : 'offline'}`,
          variant: "default"
        })
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to update status",
          variant: "destructive"
        })
      }
    } catch (error) {
      console.error('Error updating admin status:', error)
      toast({
        title: "Error",
        description: "Failed to update status",
        variant: "destructive"
      })
    } finally {
      setIsUpdatingStatus(false)
      setShowStatusDialog(false)
      setPendingStatusChange(null)
    }
  }

  const cancelStatusChange = () => {
    setShowStatusDialog(false)
    setPendingStatusChange(null)
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

  return (
    <div className="h-[80vh] flex flex-col bg-white/5 backdrop-blur-sm border border-white/20 rounded-lg overflow-hidden">
      {/* Teams-style Online/Offline Bar */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-white/20 bg-slate-900/80 sticky top-0 z-20">
        <Avatar className="h-9 w-9">
          <AvatarFallback className="bg-white/20 text-white">
            {adminDetails?.name ? adminDetails.name[0] : "A"}
          </AvatarFallback>
        </Avatar>
        <div className="flex items-center gap-2">
          <span className={cn(
            "h-3 w-3 rounded-full inline-block",
            adminIsOnline ? "bg-green-400" : "bg-red-400"
          )} />
          <span className={cn(
            "text-sm font-medium",
            adminIsOnline ? "text-green-400" : "text-red-400"
          )}>
            {adminIsOnline ? "Online" : "Offline"}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleStatusToggle(!adminIsOnline)}
          disabled={isUpdatingStatus}
          className="h-8 w-8 p-0 hover:bg-white/10 ml-2"
          aria-label="Toggle Online/Offline"
        >
          {isUpdatingStatus ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : adminIsOnline ? (
            <ToggleRight className="h-5 w-5 text-green-400" />
          ) : (
            <ToggleLeft className="h-5 w-5 text-red-400" />
          )}
        </Button>
        {adminDetails?.name && (
          <span className="ml-2 text-white/80 font-medium text-sm truncate max-w-[120px]">{adminDetails.name}</span>
        )}
        <span className="ml-auto text-xs text-yellow-400 font-medium">
          (Required to go offline before leaving)
        </span>
      </div>
      {/* End Teams-style bar */}
      <div className="p-0 grid grid-cols-1 md:grid-cols-4 h-full min-h-0">
        {/* Chat List Sidebar */}
        <div className="col-span-1 border-r border-white/20 flex flex-col bg-white/5 h-full min-h-0">
          <div className="p-4 border-b border-white/20 flex flex-col justify-center h-28">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">Chats</h2>
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
              <div className="flex flex-col items-center justify-center h-full py-8 px-4">
                <div className="text-center space-y-3">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/10 border border-white/20">
                    <MessageSquare className="h-6 w-6 text-white/60" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-white">No Chats</h3>
                    <p className="text-xs text-white/60">
                      Waiting for new chat requests...
                    </p>
                  </div>
                  
                  {/* Status indicator */}
                  <div className="flex items-center justify-center gap-1.5">
                    <div className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      adminIsOnline ? "bg-green-400" : "bg-red-400"
                    )} />
                    <span className={cn(
                      "text-xs font-medium",
                      adminIsOnline ? "text-green-400" : "text-red-400"
                    )}>
                      {adminIsOnline ? "Online" : "Offline"}
                    </span>
                  </div>
                  
                  {/* Quick tip */}
                  {!adminIsOnline && (
                    <div className="mt-3 p-2 bg-red-500/10 rounded border border-red-500/20">
                      <p className="text-xs text-red-300">
                        Go online to receive new chats
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                {/* Offline Warning */}
                {!adminIsOnline && (
                  <div className="p-3 bg-red-500/10 border-b border-red-500/20">
                    <div className="flex items-center gap-2 text-red-300 text-sm">
                      <WifiOff className="h-4 w-4" />
                      <span className="font-medium">You are offline</span>
                    </div>
                    <p className="text-xs text-red-300/70 mt-1">
                      New chat requests will not be assigned to you. Go online to receive new chats.
                    </p>
                  </div>
                )}

                {/* Pending Chats */}
                {chats.filter(chat => chat.status === "PENDING").length > 0 && (
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-white/80 px-3 py-2 bg-white/5 border-b border-white/10">Pending Chats</h3>
                    {chats.filter(chat => chat.status === "PENDING").map(chat => {
                      const isNewRequest = chat.status === 'PENDING' && !chat.adminId;
                      const isAssignedToMe = chat.adminId && currentAdminId && chat.adminId === currentAdminId;
                      const userName = chat.user && chat.user.name ? chat.user.name : (chat.user && chat.user.email ? chat.user.email : (chat.user && chat.user.phoneNumber ? chat.user.phoneNumber : 'User'));
                      const userInitial = userName[0] || 'U';
                      const lastMessage = chat.messages && chat.messages[0] ? chat.messages[0].content : '';
                      
                      return (
                        <div
                          key={chat.id}
                          onClick={async () => {
                            await handleJoinRoom(chat)
                          }}
                          className={cn(
                            "p-3 border-b border-white/10 flex items-start gap-3 cursor-pointer hover:bg-white/10 transition-all duration-200",
                            {
                              "bg-white/15": selectedChat?.id === chat.id,
                              "border-l-4 border-l-orange-500 bg-orange-500/10": isNewRequest,
                              "border-l-4 border-l-green-500 bg-green-500/10": isAssignedToMe
                            }
                          )}
                        >
                          <Avatar className="mt-1">
                            <AvatarFallback className="bg-white/20 text-white">{userInitial}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between mb-1">
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-white truncate">
                                  {chat.userName || 'User'}
                                </p>
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
                                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
                                  {chat.status}
                                </span>
                                {isNewRequest && (
                                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-orange-500/20 text-orange-300 border border-orange-500/30">
                                    NEW
                                  </span>
                                )}
                              </div>

                              {/* Show Join if not ACTIVE, else show Joined */}
                              {chat.status === 'ACTIVE' ? (
                                <span className="text-xs font-semibold text-green-400">Joined</span>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-auto px-3 py-1 text-sm bg-primary text-primary-foreground hover:bg-primary/90"
                                  onClick={(e) => { e.stopPropagation(); handleJoinRoom(chat); }}
                                >
                                  Join
                                </Button>
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
                    })}
                  </div>
                )}

                {/* Active Chats */}
                {chats.filter(chat => chat.status === "ACTIVE").length > 0 && (
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-white/80 px-3 py-2 bg-white/5 border-b border-white/10">Active Chats</h3>
                    {chats.filter(chat => chat.status === "ACTIVE").map(chat => {
                      const isNewRequest = chat.status === 'PENDING' && !chat.adminId;
                      const isReopened = chat.status === 'CLOSED' && chat.closedAt && 
                        (new Date().getTime() - new Date(chat.closedAt).getTime()) < 24 * 60 * 60 * 1000;
                      const isAssignedToMe = chat.adminId && currentAdminId && chat.adminId === currentAdminId;
                      const userName = chat.user && chat.user.name ? chat.user.name : (chat.user && chat.user.email ? chat.user.email : (chat.user && chat.user.phoneNumber ? chat.user.phoneNumber : 'User'));
                      const userInitial = userName[0] || 'U';
                      const lastMessage = chat.messages && chat.messages[0] ? chat.messages[0].content : '';
                      
                      return (
                        <div
                          key={chat.id}
                          onClick={async () => {
                            await handleSelectChat(chat)
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
                                <p className="font-semibold text-white truncate">
                                  {chat.userName || 'User'}
                                </p>
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

                              {/* Always show Joined for ACTIVE */}
                              <span className="text-xs font-semibold text-green-400">Joined</span>
                            </div>

                            {lastMessage && (
                              <p className="text-sm text-white/70 truncate mt-1">
                                {lastMessage}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Closed Chats */}
                {chats.filter(chat => chat.status === "CLOSED").length > 0 && (
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-white/80 px-3 py-2 bg-white/5 border-b border-white/10">Closed Chats</h3>
                    {chats.filter(chat => chat.status === "CLOSED").map(chat => {
                      const userName = chat.user && chat.user.name ? chat.user.name : (chat.user && chat.user.email ? chat.user.email : (chat.user && chat.user.phoneNumber ? chat.user.phoneNumber : 'User'));
                      const userInitial = userName[0] || 'U';
                      const lastMessage = chat.messages && chat.messages[0] ? chat.messages[0].content : '';
                      
                      return (
                        <div
                          key={chat.id}
                          onClick={async () => {
                            await handleJoinRoom(chat)
                          }}
                          className={cn(
                            "p-3 border-b border-white/10 flex items-start gap-3 cursor-pointer hover:bg-white/10 transition-all duration-200",
                            {
                              "bg-white/15": selectedChat?.id === chat.id,
                            }
                          )}
                        >
                          <Avatar className="mt-1">
                            <AvatarFallback className="bg-white/20 text-white">{userInitial}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between mb-1">
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-white truncate">
                                  {chat.userName || 'User'}
                                </p>
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
                                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-500/20 text-red-300 border border-red-500/30">
                                  {chat.status}
                                </span>
                              </div>

                              {/* Always show Join for CLOSED */}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-auto px-3 py-1 text-sm bg-primary text-primary-foreground hover:bg-primary/90"
                                onClick={(e) => { e.stopPropagation(); handleJoinRoom(chat); }}
                              >
                                Join
                              </Button>
                            </div>

                            {lastMessage && (
                              <p className="text-sm text-white/70 truncate mt-1">
                                {lastMessage}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Archived Chats */}
                {chats.filter(chat => chat.status === "ARCHIVED").length > 0 && (
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-white/80 px-3 py-2 bg-white/5 border-b border-white/10">Archived Chats</h3>
                    {chats.filter(chat => chat.status === "ARCHIVED").map(chat => {
                      const userName = chat.user && chat.user.name ? chat.user.name : (chat.user && chat.user.email ? chat.user.email : (chat.user && chat.user.phoneNumber ? chat.user.phoneNumber : 'User'));
                      const userInitial = userName[0] || 'U';
                      const lastMessage = chat.messages && chat.messages[0] ? chat.messages[0].content : '';
                      
                      return (
                        <div
                          key={chat.id}
                          onClick={async () => {
                            await handleJoinRoom(chat)
                          }}
                          className={cn(
                            "p-3 border-b border-white/10 flex items-start gap-3 cursor-pointer hover:bg-white/10 transition-all duration-200",
                            {
                              "bg-white/15": selectedChat?.id === chat.id,
                            }
                          )}
                        >
                          <Avatar className="mt-1">
                            <AvatarFallback className="bg-white/20 text-white">{userInitial}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between mb-1">
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-white truncate">
                                  {chat.userName || 'User'}
                                </p>
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
                                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-500/20 text-gray-300 border border-gray-500/30">
                                  {chat.status}
                                </span>
                              </div>

                              {/* Always show Join for ARCHIVED */}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-auto px-3 py-1 text-sm bg-primary text-primary-foreground hover:bg-primary/90"
                                onClick={(e) => { e.stopPropagation(); handleJoinRoom(chat); }}
                              >
                                Join
                              </Button>
                            </div>

                            {lastMessage && (
                              <p className="text-sm text-white/70 truncate mt-1">
                                {lastMessage}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
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
              <div className="p-4 border-b border-white/20 flex items-center justify-between bg-white/5 h-28 flex-shrink-0">
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
                    <DropdownMenuItem
                      className="text-white hover:bg-white/10"
                      onClick={handleCloseChat}
                      disabled={selectedChat?.status !== "ACTIVE" || isClosingChat}
                    >
                      {isClosingChat ? "Closing..." : "Close Chat"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-white hover:bg-white/10"
                      onClick={handleArchiveChat}
                      disabled={selectedChat?.status !== "CLOSED" || isArchivingChat}
                    >
                      {isArchivingChat ? "Archiving..." : "Archive Chat"}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="flex-1 min-h-0 p-6 overflow-y-auto space-y-6 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
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
                        <Avatar className="h-8 w-8 flex-shrink-0">
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
                        <p className="text-sm break-words">{msg.content}</p>
                        <span className="text-xs text-white/60 mt-1 block text-right">
                          {formatTimestamp(msg.createdAt)}
                        </span>
                      </div>
                      {msg.isAdmin && (
                        <Avatar className="h-8 w-8 flex-shrink-0">
                          <AvatarFallback className="bg-primary text-white">A</AvatarFallback>
                        </Avatar>
                      )}
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>
              <div className="p-4 border-t border-white/20 bg-white/5 flex-shrink-0">
                {isTyping && <p className="text-xs text-white/60 mb-2">User is typing...</p>}
                {selectedChat && (selectedChat.status === "CLOSED" || selectedChat.status === "ARCHIVED") && (
                  <div className="mb-3 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded text-xs text-yellow-300">
                    This chat is {selectedChat.status.toLowerCase()}. You can view the conversation but cannot send new messages.
                  </div>
                )}
                <div className="relative">
                  <Input
                    placeholder={selectedChat && (selectedChat.status === "CLOSED" || selectedChat.status === "ARCHIVED") ? "Chat is closed/archived" : "Type your message..."}
                    value={message}
                    onChange={(e) => {
                      setMessage(e.target.value)
                      handleTyping()
                    }}
                    onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
                    className="pr-24 bg-white/10 border-white/20 text-white placeholder:text-white/60 focus:border-primary"
                    disabled={selectedChat && (selectedChat.status === "CLOSED" || selectedChat.status === "ARCHIVED")}
                  />
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-white hover:bg-white/10"
                      onClick={handleAIRefine}
                      disabled={!message.trim() || isRefiningMessage || (selectedChat && (selectedChat.status === "CLOSED" || selectedChat.status === "ARCHIVED"))}
                      title="Refine message with AI"
                    >
                      {isRefiningMessage ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-white hover:bg-white/10"
                      onClick={handleSendMessage}
                      disabled={!message.trim() || (selectedChat && (selectedChat.status === "CLOSED" || selectedChat.status === "ARCHIVED"))}
                      title="Send message"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-white/80">
              <div className="text-center space-y-4">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white/10 border border-white/20">
                  <MessageSquare className="h-10 w-10 text-primary" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold text-white">Welcome to Admin Chat</h2>
                  <p className="text-sm text-white/70 max-w-md">
                    Select a chat from the sidebar to start helping customers. 
                    New chat requests will appear automatically when customers need assistance.
                  </p>
                </div>
                
                {/* Status indicator */}
                <div className="flex items-center justify-center gap-2">
                  <div className={cn(
                    "h-2 w-2 rounded-full",
                    adminIsOnline ? "bg-green-400" : "bg-red-400"
                  )} />
                  <span className={cn(
                    "text-sm font-medium",
                    adminIsOnline ? "text-green-400" : "text-red-400"
                  )}>
                    {adminIsOnline ? "Online - Ready to help" : "Offline - Go online to receive chats"}
                  </span>
                </div>
                
                {/* Quick stats */}
                {chats.length > 0 && (
                  <div className="mt-6 p-4 bg-white/5 rounded-lg border border-white/10">
                    <p className="text-xs text-white/60 mb-2">Chat Summary:</p>
                    <div className="flex justify-center gap-4 text-xs">
                      <span className="text-yellow-400">Pending: {chats.filter(c => c.status === 'PENDING').length}</span>
                      <span className="text-green-400">Active: {chats.filter(c => c.status === 'ACTIVE').length}</span>
                      <span className="text-red-400">Closed: {chats.filter(c => c.status === 'CLOSED').length}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        
        {/* Agent Panel - Only visible when chat is selected */}
        {selectedChat && (
          <div className="col-span-1 border-l border-white/20 flex flex-col bg-white/5 min-h-0">
            <div className="p-4 border-b border-white/20 text-center bg-white/5 flex items-center justify-center h-28 flex-shrink-0">
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
                  <div className="p-4 space-y-6 flex-1 min-h-0 overflow-y-auto scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
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
                        {isLoadingDocuments ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-4 w-4 animate-spin text-primary mr-2" />
                            <span className="text-sm text-white/60">Loading documents...</span>
                          </div>
                        ) : userDocs.length > 0 ? (
                          userDocs.map(folder => (
                              <div key={folder.id}>
                                  <h4 className="font-medium text-sm text-white">{folder.name}</h4>
                                  {folder.File.length > 0 ? folder.File.map(file => (
                                      <a 
                                        key={file.id} 
                                        href={`/api/admin/files?fileId=${file.id}`}
                                        className="flex items-center text-sm text-primary hover:text-primary/80 transition-colors"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={async (e) => {
                                          e.preventDefault();
                                          try {
                                            // First request to get signed URL
                                            const response = await fetch(`/api/admin/files?fileId=${file.id}`);
                                            if (!response.ok) {
                                              throw new Error('Failed to get file access URL');
                                            }
                                            const data = await response.json();
                                            if (data.success && data.downloadUrl) {
                                              // Open file with signed URL
                                              window.open(data.downloadUrl, '_blank');
                                            } else {
                                              throw new Error(data.error || 'Failed to get download URL');
                                            }
                                          } catch (error) {
                                            console.error('Error accessing file:', error);
                                            toast({
                                              title: "Error",
                                              description: "Failed to access file. Please try again.",
                                              variant: "destructive"
                                            });
                                          }
                                        }}
                                      >
                                          <FileText className="mr-2 h-4 w-4"/>
                                          {file.originalName}
                                      </a>
                                  )) : <p className="text-sm text-white/60">No Files in this folder</p>}
                              </div>
                          ))
                        ) : (
                          <p className="text-sm text-white/60">No documents uploaded.</p>
                        )}
                      </div>
                    </div>

                    {/* osTickets */}
                    <div className="space-y-2">
                      <h3 className="font-semibold text-white">osTicket Tickets</h3>
                      <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                        {isLoadingOsTickets ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-4 w-4 animate-spin text-primary mr-2" />
                            <span className="text-sm text-white/60">Loading tickets...</span>
                          </div>
                        ) : userOsTickets.length > 0 ? (
                          userOsTickets.map(ticket => (
                            <div key={ticket.id} className="p-2 bg-white/10 border border-white/20 rounded">
                              <div className="flex items-center justify-between">
                                <span className="font-mono text-xs text-yellow-300">#{ticket.osTicketId}</span>
                                <span className="text-xs text-white/60">{formatTimestamp(ticket.createdAt)}</span>
                              </div>
                              <div className="text-sm text-white/80 truncate">
                                {ticket.details.subject || 'No subject'}
                              </div>
                              <div className="text-xs text-white/60 truncate">
                                {ticket.details.status ? `Status: ${ticket.details.status}` : ''}
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-white/60">No osTicket tickets found.</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Status Change Confirmation Dialog */}
      <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
        <DialogContent className="bg-slate-800 border-white/20 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {pendingStatusChange ? (
                <>
                  <Wifi className="h-5 w-5 text-green-400" />
                  Go Online
                </>
              ) : (
                <>
                  <WifiOff className="h-5 w-5 text-red-400" />
                  Go Offline
                </>
              )}
            </DialogTitle>
            <DialogDescription className="text-white/70">
              {pendingStatusChange 
                ? "Going online will make you available to receive new chat requests and notifications. You'll be automatically assigned to new chats based on availability."
                : "Going offline will prevent you from receiving new chat requests. You can still view and respond to existing chats, but new users won't be assigned to you."
              }
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={cancelStatusChange}
              className="bg-slate-700 text-white border-white/20 hover:bg-slate-600"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmStatusChange}
              disabled={isUpdatingStatus}
              className={cn(
                "text-white",
                pendingStatusChange 
                  ? "bg-green-600 hover:bg-green-700" 
                  : "bg-red-600 hover:bg-red-700"
              )}
            >
              {isUpdatingStatus ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                `Go ${pendingStatusChange ? 'Online' : 'Offline'}`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Window Close Dialog */}
      <Dialog open={showWindowCloseDialog} onOpenChange={setShowWindowCloseDialog}>
        <DialogContent className="bg-slate-800 border-white/20 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <WifiOff className="h-5 w-5 text-red-400" />
              Set Status to Offline?
            </DialogTitle>
            <DialogDescription className="text-white/70">
              You must set your status to offline before leaving. Would you like to go offline now?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={async () => {
                try {
                  const result = await updateAdminStatus(false);
                  if (result.success) {
                    setAdminIsOnline(false);
                    toast({
                      title: "Status Updated",
                      description: "You are now offline. You can safely close the tab.",
                      variant: "default"
                    });
                    setShowWindowCloseDialog(false);
                    setPendingUnloadEvent(null);
                    // After status is set to offline, allow the window to close
                    window.removeEventListener('beforeunload', () => {}); // Remove to avoid loop
                    window.close();
                  } else {
                    toast({
                      title: "Error",
                      description: result.error || "Failed to go offline. Please try again.",
                      variant: "destructive"
                    });
                  }
                } catch (error) {
                  toast({
                    title: "Error",
                    description: "Failed to go offline. Please try again.",
                    variant: "destructive"
                  });
                }
              }}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Set Offline
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setShowWindowCloseDialog(false);
                setPendingUnloadEvent(null);
              }}
              className="bg-slate-700 text-white border-white/20 hover:bg-slate-600"
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* OsTicket Creation Dialog */}
      {selectedChat && (
        <OsTicketDialog
          open={showOsTicketDialog}
          onOpenChange={setShowOsTicketDialog}
          user={selectedChat.user}
          userDocs={userDocs}
          onSubmit={handleOsTicketSubmit}
        />
      )}

      <Toaster />
    </div>
  )
}