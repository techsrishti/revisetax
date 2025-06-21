"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ExternalLink, Send, ArrowLeft } from "lucide-react"
import { createClient } from "@/utils/supabase/client"
import styles from "./chat-module.module.css"

interface ChatModuleProps {
  onChatStarted?: (chatName: string, chatType: string) => void
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

export default function ChatModule({ onChatStarted, selectedChatId, onBackToChats, socket, onJoinChat }: ChatModuleProps) {
  const [selectedChatTypes, setSelectedChatTypes] = useState<string[]>(['ITRTaxFiling'])
  const [isConnecting, setIsConnecting] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState("")
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [chatStatus, setChatStatus] = useState<string>('ACTIVE')
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        setUser(user)
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
    return selectedChatTypes[0] ? chatTypeMap[selectedChatTypes[0]] : 'ITR Tax Filing'
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
      const chatName = getSelectedChatName()
      if (onChatStarted && chatName) {
        onChatStarted(chatName, selectedChatTypes[0])
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

    return () => {
      socket.off("chat_started")
      socket.off("chat_history")
      socket.off("new_message")
      socket.off("chat_closed")
      socket.off("chat_reopened")
    }
  }, [socket, onChatStarted, selectedChatTypes, getSelectedChatName])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
    }
  }, [messages])

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

  const handleReopenChat = () => {
    if (!socket || !selectedChatId) return
    
    socket.emit("reopen_chat", { chatId: selectedChatId })
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
            <button 
              className={styles.backButton}
              onClick={onBackToChats}
            >
              <ArrowLeft size={20} />
              Back to Chats
            </button>
            <h2 className={styles.chatTitle}>Chat Support</h2>
          </div>
          
          <div className={styles.messagesContainer} ref={messagesContainerRef}>
            {isLoadingMessages ? (
              <div className={styles.noMessages}>
                <p>Loading messages...</p>
              </div>
            ) : messages.length === 0 ? (
              <div className={styles.noMessages}>
                <p>No messages yet. Start the conversation!</p>
              </div>
            ) : (
              messages.map((message) => (
                <div 
                  key={message.id} 
                  className={`${styles.message} ${message.isAdmin ? styles.adminMessage : styles.userMessage}`}
                >
                  <div className={styles.messageContent}>
                    <div className={styles.messageSender}>
                      {message.senderName || (message.isAdmin ? 'Admin' : 'You')}
                    </div>
                    <div className={styles.messageText}>
                      {message.content}
                    </div>
                    <div className={styles.messageTime}>
                      {message.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))
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
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type your message..."
                className={styles.input}
                disabled={chatStatus === 'CLOSED'}
              />
              <button
                onClick={handleSendMessage}
                disabled={!newMessage.trim() || chatStatus === 'CLOSED'}
                className={styles.sendButton}
              >
                <Send size={16} />
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
                <p className={styles.subLabel}>Income Tax Returns 2024 - 2025</p>
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
              className={`${buttonVariants({ variant: "outline" })} ${styles.scheduleButton}`}
              onClick={() => window.open('https://book.revisetax.com/team/tax-experts/book-a-call', '_blank')}
            >
              <ExternalLink className={styles.scheduleIcon} />
              Schedule a Call
            </Button>
        </div>
      </div>
    </div>
  )
}