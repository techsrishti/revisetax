"use server"
import { createClient } from "@/utils/supabase/server"
import { prisma } from "@/lib/prisma"
import { ChatTypes } from "@prisma/client"

export interface ErrorResponse {
  success: false
  error: string
  errorMessage: string
  errorCode: string
}

export interface GetAdminChatsSuccessResponse {
  success: true,
  chats: {
    id: string,
    chatName: string,
    socketIORoomId: string,
    userId: string,
    user: {
      name: string | null,
      email: string | null,
      phoneNumber: string
    },
    updatedAt: Date,
    chatType: string,
    messages: {
      id: string,
      content: string | null,
      createdAt: Date,
      isAdmin: boolean
    }[]
  }[]
}

export async function getAdminChats(): Promise<GetAdminChatsSuccessResponse|ErrorResponse> {
  try {


    const chats = await prisma.chat.findMany({
      include: {
        user: {
          select: {
            name: true,
            email: true,
            phoneNumber: true
          }
        },
        messages: {
          orderBy: {
            createdAt: 'desc'
          },
          take: 1
        }
      },
      orderBy: {
        updatedAt: 'desc'
      }
    })

    return {
      success: true,
      chats: chats.map(chat => ({
        id: chat.id,
        chatName: chat.chatName,
        socketIORoomId: chat.socketIORoomId,
        userId: chat.userId,
        user: chat.user,
        updatedAt: chat.updatedAt,
        chatType: chat.chatType,
        messages: chat.messages
      }))
    }

  } catch (error) {
    console.log("getAdminChats: Error getting chats: ", error)
    return {
      success: false,
      error: 'Failed to get chats',
      errorMessage: 'An unknown error occurred',
      errorCode: 'UNKNOWN_ERROR',
    }
  }
} 