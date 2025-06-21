"use server"
import { createClient } from "@/utils/supabase/server"
import { prisma } from "@/lib/prisma"
import { ChatTypes, ChatStatus } from "@prisma/client"

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
    admin?: {
        id: string;
        name: string;
        email: string;
    } | null;
  } & {
    id: string;
    chatName: string;
    socketIORoomId: string;
    userId: string;
    adminId: string | null;
    updatedAt: Date;
    chatType: ChatTypes;
    status: ChatStatus;
    closedAt: Date | null;
    closedBy: string | null;
    closeReason: string | null;
    isActive: boolean;
  })[]
}

export async function getAdminChats(): Promise<GetAdminChatsSuccessResponse|ErrorResponse> {
  try {
    // Get current admin from Supabase auth
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return {
        success: false,
        error: 'Not authenticated',
        errorMessage: 'Admin not authenticated',
        errorCode: 'AUTH_ERROR',
      }
    }

    // Find admin record
    const admin = await prisma.admin.findUnique({
      where: { authId: user.id }
    })

    if (!admin) {
      return {
        success: false,
        error: 'Admin not found',
        errorMessage: 'Admin record not found',
        errorCode: 'ADMIN_NOT_FOUND',
      }
    }

    // Get chats that should be visible to this admin:
    // 1. Chats assigned to this admin (ACTIVE or CLOSED)
    // 2. PENDING chats (new requests)
    // 3. Recently closed chats that might be reopened
    const chats = await prisma.chat.findMany({
      where: {
        OR: [
          // Chats assigned to this admin
          { adminId: admin.id },
          // New chat requests (PENDING status)
          { status: 'PENDING' },
          // Recently closed chats (within last 24 hours) that might be reopened
          {
            status: 'CLOSED',
            closedAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
            }
          }
        ],
        isActive: true
      },
      include: {
        user: {
          select: {
            name: true,
            email: true,
            phoneNumber: true
          }
        },
        admin: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        messages: {
          orderBy: {
            createdAt: 'desc'
          },
          take: 1
        }
      },
      orderBy: [
        // Order by status priority: PENDING first, then ACTIVE, then CLOSED
        {
          status: 'asc'
        },
        // Then by last activity (most recent first)
        {
          updatedAt: 'desc'
        }
      ]
    })

    return {
      success: true,
      chats: chats,
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