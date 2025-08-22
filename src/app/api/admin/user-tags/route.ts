import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const { userId, tags } = await request.json()

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID is required' },
        { status: 400 }
      )
    }

    // Update user tags
    const updatedUser = await (prisma.user as any).update({
      where: { id: userId },
      data: { tags: tags || null },
      select: {
        id: true,
        name: true,
        email: true,
        tags: true
      }
    })

    return NextResponse.json({
      success: true,
      user: updatedUser
    })
  } catch (error) {
    console.error('Error updating user tags:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update user tags' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID is required' },
        { status: 400 }
      )
    }

    const user = await (prisma.user as any).findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        tags: true
      }
    })

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      user
    })
  } catch (error) {
    console.error('Error fetching user tags:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch user tags' },
      { status: 500 }
    )
  }
}
