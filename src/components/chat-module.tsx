"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ExternalLink, Send, ArrowLeft, Paperclip } from "lucide-react"
import { createClient } from "@/utils/supabase/client"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import ChatAttachments from "./chatattachments"
import styles from "./chat-module.module.css"

interface ChatModuleProps {
  onChatStarted?: (chatName: string, chatType: string, chatId: string, roomId: string) => void
  selectedChatId?: string
  onBackToChats?: () => void
  socket?: any
  onJoinChat?: (chatId: string) => void
}

interface Message {
  id: string
  content: string
  isAdmin: boolean
  timestamp: Date
  senderName?: string
}

// Add date formatting helper
const formatMessageDate = (date: Date) => {
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (date.toDateString() === today.toDateString()) {
    return "Today"
  } else if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday"
  } else {
    return date.toLocaleDateString('en-IN', { 
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  }
}

// Add date separator component
const DateSeparator = ({ date }: { date: string }) => (
  <div className={styles.dateSeparator}>
    <div className={styles.dateSeparatorLine} />
    <span className={styles.dateSeparatorText}>{date}</span>
    <div className={styles.dateSeparatorLine} />
  </div>
)

export default function ChatModule({ selectedChatId, onBackToChats, socket, onJoinChat, onChatStarted }: ChatModuleProps) {
  const [selectedChatTypes, setSelectedChatTypes] = useState<string[]>(['ITRTaxFiling'])
  const [isConnecting, setIsConnecting] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [userProfile, setUserProfile] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState("")
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [chatStatus, setChatStatus] = useState<string>('ACTIVE')
  const [isTyping, setIsTyping] = useState(false)
  const [typingTimeout, setTypingTimeout] = useState<NodeJS.Timeout | null>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        setUser(user)
        
        // Also fetch user profile from database
        if (user) {
          const response = await fetch('/api/user-profile')
          if (response.ok) {
            const data = await response.json()
            setUserProfile(data.user)
          }
        }
      } catch (error) {
        console.error('Error fetching user:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchUser()
  }, [])

  const getSelectedChatName = useCallback(() => {
    const chatTypeMap: { [key: string]: string } = {
      'ITRTaxFiling': 'ITR Tax Filing',
      'LoansProducts': 'Loans & Products',
      'FinancialAdvisory': 'Financial Advisory'
    }
    // Ensure we only return one chat type
    const chatType = selectedChatTypes[0] || 'ITRTaxFiling'
    return chatTypeMap[chatType] || 'ITR Tax Filing'
  }, [selectedChatTypes])

  useEffect(() => {
    // Ensure we only have one chat type selected
    if (selectedChatTypes.length > 1) {
      setSelectedChatTypes([selectedChatTypes[0]])
    }
  }, [selectedChatTypes])

  useEffect(() => {
    if (selectedChatId && socket && onJoinChat) {
      // Clear previous messages when switching to a new chat
      setMessages([])
      setIsLoadingMessages(true)
      
      onJoinChat(selectedChatId)
      // Get chat history
      socket.emit("get_chat_history", { chatId: selectedChatId })
    } else if (!selectedChatId) {
      // Clear messages when going back to chat selection
      setMessages([])
      setIsLoadingMessages(false)
    }
  }, [selectedChatId, socket, onJoinChat])

  useEffect(() => {
    if (!socket) return

    socket.on("chat_started", (data: any) => {
      console.log("Chat started in ChatModule:", data)
      if (onChatStarted && data.chatName && data.chatType && data.chatId && data.roomId) {
        onChatStarted(data.chatName, data.chatType, data.chatId, data.roomId)
      } else {
        console.warn("Missing required data in chat_started event:", data)
      }
    })

    socket.on("chat_history", (data: any) => {
      console.log("Chat history:", data)
      setIsLoadingMessages(false)
      setChatStatus(data.status || 'ACTIVE')
      setMessages(data.messages.map((msg: any) => ({
        id: msg.id,
        content: msg.content,
        isAdmin: msg.isAdmin,
        timestamp: new Date(msg.createdAt),
        senderName: msg.isAdmin ? data.admin?.name : data.user?.name
      })))
    })

    socket.on("new_message", (message: any) => {
      console.log("New message:", message)
      setMessages(prev => [...prev, {
        id: message.id,
        content: message.content,
        isAdmin: message.isAdmin,
        timestamp: new Date(message.timestamp),
        senderName: message.senderName
      }])
    })

    socket.on("chat_closed", (data: any) => {
      console.log("Chat closed:", data)
      setChatStatus('CLOSED')
    })

    socket.on("chat_reopened", (data: any) => {
      console.log("Chat reopened:", data)
      setChatStatus(data.status || 'ACTIVE')
    })

    // Typing indicators
    socket.on("user_typing", (data: any) => {
      console.log("User typing received:", data)
      if (data.chatId === selectedChatId) {
        console.log("Setting typing indicator to true for chat:", selectedChatId)
        setIsTyping(true)
      }
    })

    socket.on("user_stopped_typing", (data: any) => {
      console.log("User stopped typing received:", data)
      if (data.chatId === selectedChatId) {
        console.log("Setting typing indicator to false for chat:", selectedChatId)
        setIsTyping(false)
      }
    })

    return () => {
      socket.off("chat_started")
      socket.off("chat_history")
      socket.off("new_message")
      socket.off("chat_closed")
      socket.off("chat_reopened")
      socket.off("user_typing")
      socket.off("user_stopped_typing")
    }
  }, [socket, getSelectedChatName, onChatStarted, selectedChatId])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
    }
  }, [messages])

  // Cleanup typing timeout on unmount or chat change
  useEffect(() => {
    return () => {
      if (typingTimeout) {
        clearTimeout(typingTimeout)
      }
    }
  }, [typingTimeout])

  const handleChatTypeChange = (chatType: string, checked: boolean) => {
    if (checked) {
      setSelectedChatTypes([chatType])
    } else {
      setSelectedChatTypes(prev => prev.filter(type => type !== chatType))
    }
  }

  const handleStartChat = async () => {
    if (!socket || !user || selectedChatTypes.length === 0) return

    setIsConnecting(true)
    
    try {
      const chatName = getSelectedChatName()
      const chatType = selectedChatTypes[0]
      
      socket.emit("start_chat", { 
        chatType, 
        chatName 
      })
    } catch (error) {
      console.error("Error starting chat:", error)
    } finally {
      setIsConnecting(false)
    }
  }

  const handleSendMessage = () => {
    if (!newMessage.trim() || !socket || !selectedChatId || chatStatus === 'CLOSED') return

    socket.emit("send_message", {
      chatId: selectedChatId,
      content: newMessage.trim()
    })

    setNewMessage("")
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (chatStatus !== 'CLOSED') {
        handleSendMessage()
      }
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setNewMessage(value)
    
    // Handle typing indicators
    if (socket && selectedChatId && chatStatus !== 'CLOSED') {
      // Clear existing timeout
      if (typingTimeout) {
        clearTimeout(typingTimeout)
      }
      
      // Send typing start event
      console.log("Sending start_typing event for chat:", selectedChatId)
      socket.emit("start_typing", { chatId: selectedChatId })
      
      // Set timeout to stop typing after 2 seconds of inactivity
      const timeout = setTimeout(() => {
        console.log("Sending stop_typing event for chat:", selectedChatId)
        socket.emit("stop_typing", { chatId: selectedChatId })
      }, 2000)
      
      setTypingTimeout(timeout)
    }
  }

  const handleReopenChat = () => {
    if (!socket || !selectedChatId) return
    
    socket.emit("reopen_chat", { chatId: selectedChatId })
  }

  const formatLastActivityTime = (timestamp: Date) => {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'just now';
    if (minutes === 1) return '1 min ago';
    if (minutes < 60) return `${minutes} mins ago`;
    if (hours === 1) return '1 hour ago';
    if (hours < 24) return `${hours} hours ago`;
    if (days === 1) return '1 day ago';
    return `${days} days ago`;
  }

  // Modify the messages rendering section to include date separators
  const renderMessages = () => {
    if (messages.length === 0) {
      return (
        <div className={styles.noMessages}>
          <p>No messages yet. Start the conversation!</p>
        </div>
      )
    }

    let currentDate = ''
    
    return messages.map((message, index) => {
      const messageDate = formatMessageDate(message.timestamp)
      const showDateSeparator = messageDate !== currentDate
      
      if (showDateSeparator) {
        currentDate = messageDate
      }

      return (
        <React.Fragment key={message.id}>
          {showDateSeparator && (
            <div className={styles.dateSeparator}>
              <div className={styles.dateSeparatorLine} />
              <div className={styles.dateSeparatorText}>{messageDate}</div>
              <div className={styles.dateSeparatorLine} />
            </div>
          )}
          <div className={`${styles.message} ${message.isAdmin ? styles.adminMessage : styles.userMessage}`}>
            {message.isAdmin ? (
              <>
                <div className={styles.messageContent}>
                  <div className={styles.messageHeader}>
                    <div className={styles.adminMessageHeader}>
                      <span className={styles.messageSender}>ReviseTax</span>
                      <span className={styles.messageTime}>
                        {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                  <div className={styles.messageText}>{message.content}</div>
                </div>
                <Avatar className={styles.messageAvatar}>
                  <AvatarImage src="/chatlogo.png" alt="ReviseTax" />
                  <AvatarFallback>RT</AvatarFallback>
                </Avatar>
              </>
            ) : (
              <>
                <div className={styles.messageContent}>
                  <div className={styles.messageHeader}>
                    <span className={styles.messageSender}>
                      {message.senderName || userProfile?.name || 'User'}
                    </span>
                    <span className={styles.messageTime}>
                      {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className={styles.messageText}>{message.content}</div>
                </div>
                <Avatar className={styles.messageAvatar}>
                  {userProfile?.profileImage ? (
                    <AvatarImage src={userProfile.profileImage} alt={userProfile.name || 'User'} />
                  ) : (
                    <AvatarFallback>{message.senderName?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
                  )}
                </Avatar>
              </>
            )}
          </div>
        </React.Fragment>
      )
    })
  }

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>Loading...</h2>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Show chat interface if a chat is selected
  if (selectedChatId) {
    return (
      <div className={styles.chatContainer}>
        <div className={styles.chatInterface}>
          <div className={styles.chatHeader}>
            <div className={styles.headerLeft}>
              <div className={styles.headerInfo}>
                <h2 className={styles.chatTitle}>
                  {getSelectedChatName()}
                </h2>
                <div className={styles.lastActivity}>
                  Last activity {messages.length > 0 
                    ? formatLastActivityTime(messages[messages.length - 1].timestamp) 
                    : '1 min ago'}
                </div>
              </div>
            </div>
            <div className={styles.headerRight}>
              <Button 
                className={`${buttonVariants({ variant: "outline" })} ${styles.scheduleButton}`}
                onClick={() => window.open('https://book.revisetax.com/team/tax-experts/book-a-call', '_blank')}
              >
                <ExternalLink className={styles.scheduleIcon} />
                Schedule a Call
              </Button>
            </div>
          </div>
          
          <div className={styles.messagesContainer} ref={messagesContainerRef}>
            {isLoadingMessages ? (
              <div className={styles.noMessages}>
                <p>Loading messages...</p>
              </div>
            ) : renderMessages()}
            
            {/* Typing indicator */}
            {isTyping && (
              <div className={`${styles.message} ${styles.adminMessage}`}>
                <div className={styles.messageContent}>
                  <div className={styles.messageSender}>
                    Admin
                  </div>
                  <div className={styles.typingIndicator}>
                    <div className={styles.typingDots}>
                      <div className={styles.typingDot}></div>
                      <div className={styles.typingDot}></div>
                      <div className={styles.typingDot}></div>
                    </div>
                    <span className={styles.typingText}>typing...</span>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          {chatStatus === 'CLOSED' ? (
            <div className={styles.closedChatActions}>
              <p className={styles.closedMessage}>This chat has been closed by the admin.</p>
              <Button 
                className={styles.reopenButton}
                onClick={handleReopenChat}
              >
                Reopen Chat
              </Button>
            </div>
          ) : (
            <div className={styles.messageInput}>
              <ChatAttachments 
                selectedChatId={selectedChatId}
                socket={socket}
                onFilesSent={() => {
                  // Optional: Add any additional logic after files are sent
                  console.log("Files sent successfully")
                }}
              />
              <input
                type="text"
                value={newMessage}
                onChange={handleInputChange}
                onKeyPress={handleKeyPress}
                placeholder="Type a message"
                className={styles.input}
                disabled={chatStatus === 'CLOSED'}
              />
              <button
                onClick={handleSendMessage}
                disabled={!newMessage.trim() || chatStatus === 'CLOSED'}
                className={styles.sendButton}
              >
                <Send size={20} />
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Show chat selection interface
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {/* Chat prompt */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>What do you need help with?</h2>
          </div>
          <p className={styles.cardDescription}>
            We want to learn more about your interests so we can connect you with the most relevant expert.
          </p>

          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Trending</h3>
            <div className={styles.checkboxItem}>
              <Checkbox 
                id="itr-tax-filing" 
                className={styles.checkbox} 
                checked={selectedChatTypes.includes('ITRTaxFiling')}
                onCheckedChange={(checked) => handleChatTypeChange('ITRTaxFiling', checked as boolean)}
              />
              <div className={styles.checkboxContent}>
                <label htmlFor="itr-tax-filing" className={styles.checkboxLabel}>
                  ITR Tax Filing
                </label>
                <p className={styles.subLabel}>Income Tax Returns 2025 - 2026</p>
              </div>
            </div>
          </div>

          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Others</h3>
            <div className={styles.checkboxGroup}>
              <div className={styles.checkboxItem}>
                <Checkbox 
                  id="loans-products" 
                  className={styles.checkbox}
                  checked={selectedChatTypes.includes('LoansProducts')}
                  onCheckedChange={(checked) => handleChatTypeChange('LoansProducts', checked as boolean)}
                />
                <label htmlFor="loans-products" className={styles.checkboxLabel}>
                  Loans & Products
                </label>
              </div>
              <div className={styles.checkboxItem}>
                <Checkbox 
                  id="financial-advisory" 
                  className={styles.checkbox}
                  checked={selectedChatTypes.includes('FinancialAdvisory')}
                  onCheckedChange={(checked) => handleChatTypeChange('FinancialAdvisory', checked as boolean)}
                />
                <label htmlFor="financial-advisory" className={styles.checkboxLabel}>
                  Financial Advisory
                </label>
              </div>
            </div>
          </div>

          <Button 
            className={styles.primaryButton}
            onClick={handleStartChat}
            disabled={isConnecting || selectedChatTypes.length === 0}
          >
            {isConnecting ? "Starting Chat..." : "Start a Chat"}
          </Button>
        </div>

        {/* Schedule call */}
        <div className={styles.card}>
          <h2 className={styles.callTitle}>Schedule a call instead?</h2>
          <p className={styles.callDescription}>
            For people who need tailored services based on your use case, please schedule a call with us.
          </p>
          <Button 
            className={styles.scheduleButton}
            onClick={() => window.open('https://book.revisetax.com/team/tax-experts/book-a-call', '_blank')}
          >
            <ExternalLink className={styles.scheduleIcon} />
            <span>Schedule a Call</span>
          </Button>
        </div>
      </div>
    </div>
  )
}