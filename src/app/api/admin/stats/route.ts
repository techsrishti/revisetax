import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/utils/supabase/server'

export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch user statistics
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true
      }
    })

    const subscriptions = await prisma.subscription.findMany({
      select: {
        id: true,
        userId: true,
        isActive: true,
        planName: true,
        Plan: {
          select: {
            name: true
          }
        }
      }
    })

    // Calculate statistics
    const stats = {
      totalUsers: users.length,
      activeUsers: 0,
      inactiveUsers: 0,
      usersWithPlans: 0,
      usersWithoutPlans: 0,
      planDistribution: {} as { [key: string]: number }
    }

    // Group subscriptions by user
    const userSubscriptions = new Map<string, any[]>()
    subscriptions.forEach(sub => {
      if (!userSubscriptions.has(sub.userId)) {
        userSubscriptions.set(sub.userId, [])
      }
      userSubscriptions.get(sub.userId)!.push(sub)
    })

    // Calculate statistics
    users.forEach(user => {
      const userSubs = userSubscriptions.get(user.id) || []
      
      if (userSubs.length > 0) {
        stats.usersWithPlans++
        const hasActiveSub = userSubs.some(sub => sub.isActive)
        if (hasActiveSub) {
          stats.activeUsers++
        } else {
          stats.inactiveUsers++
        }
        
        // Count plan distribution
        userSubs.forEach(sub => {
          const planName = sub.Plan?.name || sub.planName || 'Unknown'
          stats.planDistribution[planName] = (stats.planDistribution[planName] || 0) + 1
        })
      } else {
        stats.usersWithoutPlans++
        stats.inactiveUsers++
      }
    })

    return NextResponse.json(stats)
  } catch (error) {
    console.error('Error fetching admin stats:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 