import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createClient, createAdminClient } from '@/utils/supabase/server'

export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch user statistics from database, excluding revisetax emails
    const users = await prisma.user.findMany({
      where: {
        email: {
          not: {
            endsWith: '@revisetax.com',
          },
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        supabaseUserId: true,
      },
    })

    const subscriptions = await prisma.subscription.findMany({
      select: {
        id: true,
        userId: true,
        isActive: true,
        planName: true,
        Plan: {
          select: {
            name: true,
          },
        },
      },
    })

    // Fetch Supabase Auth users for activity data
    const supabaseAdmin = createAdminClient()
    const {
      data: supabaseResponse,
      error: supabaseError,
    } = await supabaseAdmin.auth.admin.listUsers()

    if (supabaseError) {
      console.warn('Failed to fetch Supabase users:', supabaseError)
    }

    const filteredSupabaseUsers =
      supabaseResponse?.users?.filter(
        (user: any) => !user.email?.endsWith('@revisetax.com')
      ) || []

    // Calculate statistics
    const stats = {
      usersWithPlans: 0,
      usersWithoutPlans: 0,
      planDistribution: [] as { name: string; value: number }[],
      supabaseStats: {
        totalAuthUsers: filteredSupabaseUsers.length,
        recentlyActiveUsers: 0, // Users who signed in within last 30 days
        confirmedUsers: 0,
        unconfirmedUsers: 0,
      },
    }

    // Calculate Supabase Auth statistics
    if (filteredSupabaseUsers) {
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      filteredSupabaseUsers.forEach((authUser: any) => {
        // Count recently active users (signed in within last 30 days)
        if (authUser.last_sign_in_at) {
          const lastSignIn = new Date(authUser.last_sign_in_at)
          if (lastSignIn > thirtyDaysAgo) {
            stats.supabaseStats.recentlyActiveUsers++
          }
        }

        // Count confirmed vs unconfirmed users
        if (authUser.email_confirmed_at) {
          stats.supabaseStats.confirmedUsers++
        } else {
          stats.supabaseStats.unconfirmedUsers++
        }
      })
    }

    // Group subscriptions by user
    const userSubscriptions = new Map<string, any[]>()
    subscriptions.forEach(sub => {
      if (!userSubscriptions.has(sub.userId)) {
        userSubscriptions.set(sub.userId, [])
      }
      userSubscriptions.get(sub.userId)!.push(sub)
    })

    // Calculate database-based statistics
    const planCounts: { [key: string]: number } = {}
    users.forEach(user => {
      const userSubs = userSubscriptions.get(user.id) || []

      if (userSubs.length > 0) {
        stats.usersWithPlans++
        
        // Count plan distribution
        userSubs.forEach(sub => {
          const planName = sub.Plan?.name || sub.planName || 'Unknown'
          planCounts[planName] = (planCounts[planName] || 0) + 1
        })
      } else {
        stats.usersWithoutPlans++
      }
    })

    stats.planDistribution = Object.entries(planCounts).map(([name, value]) => ({
      name,
      value,
    }))
    
    // Add users with no plan to the distribution
    if (stats.usersWithoutPlans > 0) {
      stats.planDistribution.push({
        name: 'No Plan',
        value: stats.usersWithoutPlans,
      })
    }

    return NextResponse.json(stats)
  } catch (error) {
    console.error('Error fetching admin stats:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 