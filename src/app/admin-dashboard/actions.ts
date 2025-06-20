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
  chats: ({
    user: {
        name: string | null;
        email: string | null;
        phoneNumber: string;
    };
    messages: {
        id: string;
        content: string | null;
        createdAt: Date;
        isAdmin: boolean;
    }[];
  } & {
    id: string;
    chatName: string;
    socketIORoomId: string;
    userId: string;
    updatedAt: Date;
    chatType: ChatTypes;
    isAiChat: boolean;
  })[]
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
      chats: chats.map(chat => {
        const { isAiChat, ...rest } = chat as any;
        return {
          ...rest,
          isAiChat: isAiChat || false,
        };
      }),
    }

  } catch (error) {
    console.log("getAdminChats: Error getting chats: ", error)
    return {
      success: false,
      error: 'Failed to get chats',
      errorMessage: 'An unknown error occurred',
      errorCode: 'UNKNOWN_error',
    }
  }
} 