"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/utils/supabase/client"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart"
import { Bar, BarChart, CartesianGrid, XAxis, Pie, PieChart } from "recharts"
import AdminChat from "./components/admin-chat"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Users, UserCheck, UserX, CreditCard, Shield, LogOut, BarChart3, MessageSquare, Activity } from "lucide-react"

interface UserStats {
  usersWithPlans: number;
  usersWithoutPlans: number;
  planDistribution: { name: string; value: number }[];
  supabaseStats: {
    totalAuthUsers: number;
    recentlyActiveUsers: number;
    confirmedUsers: number;
    unconfirmedUsers: number;
  };
}

export default function AdminDashboard() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [userStats, setUserStats] = useState<UserStats | null>(null)
  const supabase = createClient()

  useEffect(() => {
    const checkAdmin = async () => {
      try {
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

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut()
      router.push("/admin/login")
    } catch (error) {
      console.error("Error signing out:", error)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-orange-100">
            <Shield className="h-6 w-6 text-primary animate-pulse" />
          </div>
          <div className="space-y-2">
            <div className="h-4 w-4 mx-auto animate-spin rounded-full border-2 border-white border-t-transparent"></div>
            <p className="text-white/80 text-sm">Loading admin dashboard...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-800 to-slate-900">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-700 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-100">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="font-cabinet-grotesk-variable text-2xl font-bold text-white">
                  Admin Dashboard
                </h1>
                <p className="text-white/70 text-sm">
                  ReviseTax Administration Portal
                </p>
              </div>
            </div>
            <Button 
              onClick={handleSignOut}
               size="sm"
              className="bg-primary hover:bg-primary/90 text-white"
              >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs defaultValue="overview" className="space-y-8">
          {/* Navigation */}
          <div className="flex justify-center">
            <TabsList className="bg-slate-800 border border-slate-600">
              <TabsTrigger 
                value="overview" 
                className="data-[state=active]:bg-primary data-[state=active]:text-white text-white/80"
              >
                <BarChart3 className="h-4 w-4 mr-2" />
                Overview
              </TabsTrigger>
              <TabsTrigger 
                value="chat" 
                className="data-[state=active]:bg-primary data-[state=active]:text-white text-white/80"
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                Admin Chat
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="space-y-8">
            {/* Welcome Section */}
            <Card className="bg-white/10 backdrop-blur-sm border-white/20">
              <CardHeader>
                <CardTitle className="font-cabinet-grotesk-variable text-xl font-bold text-white flex items-center">
                  <Activity className="h-5 w-5 mr-2" />
                  System Overview
                </CardTitle>
                <p className="text-white/70">
                  Monitor user activity, subscriptions, and system health
                </p>
              </CardHeader>
            </Card>

            {/* Statistics Cards */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <Card className="bg-white/10 backdrop-blur-sm border-white/20 hover:bg-white/15 transition-colors">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-white/90">Users with Plans</CardTitle>
                  <CreditCard className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">{userStats?.usersWithPlans || 0}</div>
                  <p className="text-xs text-white/60">Active subscriptions</p>
                </CardContent>
              </Card>

              <Card className="bg-white/10 backdrop-blur-sm border-white/20 hover:bg-white/15 transition-colors">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-white/90">Total Auth Users</CardTitle>
                  <Users className="h-4 w-4 text-blue-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">{userStats?.supabaseStats?.totalAuthUsers || 0}</div>
                  <p className="text-xs text-white/60">Registered users</p>
                </CardContent>
              </Card>

              <Card className="bg-white/10 backdrop-blur-sm border-white/20 hover:bg-white/15 transition-colors">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-white/90">Recently Active</CardTitle>
                  <UserCheck className="h-4 w-4 text-green-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">{userStats?.supabaseStats?.recentlyActiveUsers || 0}</div>
                  <p className="text-xs text-white/60">Last 30 days</p>
                </CardContent>
              </Card>

              <Card className="bg-white/10 backdrop-blur-sm border-white/20 hover:bg-white/15 transition-colors">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-white/90">Confirmed Users</CardTitle>
                  <UserCheck className="h-4 w-4 text-emerald-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">{userStats?.supabaseStats?.confirmedUsers || 0}</div>
                  <p className="text-xs text-white/60">Email verified</p>
                </CardContent>
              </Card>

              <Card className="bg-white/10 backdrop-blur-sm border-white/20 hover:bg-white/15 transition-colors">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-white/90">Unconfirmed Users</CardTitle>
                  <UserX className="h-4 w-4 text-yellow-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">{userStats?.supabaseStats?.unconfirmedUsers || 0}</div>
                  <p className="text-xs text-white/60">Email not verified</p>
                </CardContent>
              </Card>
            </div>

            {/* Chart Section */}
            <Card className="bg-white/10 backdrop-blur-sm border-white/20">
              <CardHeader>
                <CardTitle className="font-cabinet-grotesk-variable text-xl font-bold text-white">
                  Plan Distribution
                </CardTitle>
                <p className="text-white/70">
                  Overview of user subscription plans
                </p>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={{
                    plans: {
                      label: "Plans",
                      color: "hsl(var(--chart-1))",
                    },
                  }}
                  className="mx-auto aspect-square h-[300px]"
                >
                  <PieChart>
                    <ChartTooltip
                      cursor={false}
                      content={<ChartTooltipContent hideLabel />}
                    />
                    <Pie
                      data={userStats?.planDistribution}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={80}
                      strokeWidth={5}
                    />
                    <ChartLegend
                      content={<ChartLegendContent nameKey="name" />}
                      className="-translate-y-[10px] flex-wrap gap-2 [&>*]:basis-1/4 [&>*]:justify-center"
                    />
                  </PieChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="chat" className="space-y-6">
            <Card className="bg-white/10 backdrop-blur-sm border-white/20">
              <CardHeader>
                <CardTitle className="font-cabinet-grotesk-variable text-xl font-bold text-white flex items-center">
                  <MessageSquare className="h-5 w-5 mr-2" />
                  Customer Support Chat
                </CardTitle>
                <p className="text-white/70">
                  Manage customer conversations and support tickets
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <AdminChat />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-white/5 backdrop-blur-sm mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="text-center">
            <p className="text-white/60 text-sm">
              ReviseTax Admin Portal &copy; 2024 | Protected by Microsoft Authenticator
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}