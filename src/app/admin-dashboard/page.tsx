"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/utils/supabase/client"
import AdminChat from "./components/admin-chat"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Users, UserCheck, UserX, CreditCard } from "lucide-react"

interface UserStats {
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  usersWithPlans: number;
  usersWithoutPlans: number;
  planDistribution: {
    [key: string]: number;
  };
}

export default function AdminDashboard() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [userStats, setUserStats] = useState<UserStats | null>(null)

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          router.push("/admin/login")
          return
        }

        // Check if user is admin
        const adminCheckResponse = await fetch('/api/admin/check')
        if (!adminCheckResponse.ok) {
          router.push("/admin/login")
          return
        }
        
        const adminCheck = await adminCheckResponse.json()
        if (!adminCheck.isAdmin) {
          router.push("/admin/login")
          return
        }

        // Fetch user statistics from API
        const response = await fetch('/api/admin/stats')
        if (!response.ok) {
          throw new Error('Failed to fetch admin stats')
        }
        
        const stats: UserStats = await response.json()
        setUserStats(stats)
        setIsLoading(false)
      } catch (error) {
        console.error("Error checking admin status:", error)
        router.push("/admin/login")
      }
    }

    checkAdmin()
  }, [router])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#E9420C]"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Admin Dashboard</h1>
        
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{userStats?.totalUsers || 0}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Users</CardTitle>
              <UserCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{userStats?.activeUsers || 0}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Inactive Users</CardTitle>
              <UserX className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{userStats?.inactiveUsers || 0}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Users with Plans</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{userStats?.usersWithPlans || 0}</div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="plans" className="space-y-4">
          <TabsList>
            <TabsTrigger value="plans">Plan Distribution</TabsTrigger>
            <TabsTrigger value="chat">Admin Chat</TabsTrigger>
          </TabsList>
          
          <TabsContent value="plans" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Plan Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {userStats?.planDistribution && Object.entries(userStats.planDistribution).map(([plan, count]) => (
                    <div key={plan} className="flex items-center justify-between">
                      <span className="font-medium">{plan}</span>
                      <span className="text-sm text-muted-foreground">{count} users</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-4 border-t">
                    <span className="font-medium">No Plan</span>
                    <span className="text-sm text-muted-foreground">{userStats?.usersWithoutPlans || 0} users</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="chat">
            <AdminChat />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
} 