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

export interface GetAdminStatusSuccessResponse {
  success: true,
  isOnline: boolean,
  adminId: string
}

export interface UpdateAdminStatusSuccessResponse {
  success: true,
  isOnline: boolean
}

export async function getAdminStatus(): Promise<GetAdminStatusSuccessResponse|ErrorResponse> {
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

    // Find admin record in Prisma using Supabase user id
    const admin = await prisma.admin.findUnique({
      where: { authId: user.id },
      select: {
        id: true,
        isOnline: true
      }
    })

    if (!admin) {
      return {
        success: false,
        error: 'Admin not found',
        errorMessage: 'Admin record not found',
        errorCode: 'ADMIN_NOT_FOUND',
      }
    }

    return {
      success: true,
      isOnline: admin.isOnline,
      adminId: admin.id
    }

  } catch (error) {
    console.log("getAdminStatus: Error getting admin status: ", error)
    return {
      success: false,
      error: 'Failed to get admin status',
      errorMessage: 'An unknown error occurred',
      errorCode: 'UNKNOWN_ERROR',
    }
  }
}

export async function updateAdminStatus(isOnline: boolean): Promise<UpdateAdminStatusSuccessResponse|ErrorResponse> {
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

    // Update admin status using Prisma
    const admin = await prisma.admin.update({
      where: { authId: user.id },
      data: {
        isOnline,
        lastSeenAt: new Date(),
        ...(isOnline && { lastLoginAt: new Date() })
      },
      select: {
        id: true,
        isOnline: true
      }
    })

    return {
      success: true,
      isOnline: admin.isOnline
    }

  } catch (error) {
    console.log("updateAdminStatus: Error updating admin status: ", error)
    return {
      success: false,
      error: 'Failed to update admin status',
      errorMessage: 'An unknown error occurred',
      errorCode: 'UNKNOWN_ERROR',
    }
  }
} 