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
import { Users, UserCheck, UserX, CreditCard, LogOut, User } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"

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
  const [adminProfile, setAdminProfile] = useState<any>(null)

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          router.push("/admin/login")
          return
        }

        // Set admin profile
        setAdminProfile(user)

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

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/admin/login")
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#E9420C]"></div>
      </div>
    )
  }

  return (
    <Tabs defaultValue="overview" className="flex flex-col min-h-screen bg-gray-50/50">
      <header className="bg-white border-b sticky top-0 z-10 p-4 sm:p-6">
        <div className="relative flex items-center justify-between">
          <TabsList className="grid w-[200px] grid-cols-2">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="chat">Admin Chat</TabsTrigger>
          </TabsList>
          <h1 className="text-2xl font-bold text-gray-800">Admin Dashboard</h1>
          <div className="flex items-center gap-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={adminProfile?.user_metadata?.avatar_url} alt={adminProfile?.email} />
                    <AvatarFallback>
                      {adminProfile?.email?.charAt(0).toUpperCase() || "A"}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <div className="flex items-center justify-start gap-2 p-2">
                  <div className="flex flex-col space-y-1 leading-none">
                    <p className="font-medium">{adminProfile?.email}</p>
                    <p className="w-[200px] truncate text-sm text-muted-foreground">
                      Admin
                    </p>
                  </div>
                </div>
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <main className="flex-1 p-4 sm:p-6">
        <TabsContent value="overview" className="mt-6">
          <div className="space-y-8">
            <div>
              <h2 className="text-xl font-semibold text-gray-700 mb-4">User Statistics</h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Users with Plans</CardTitle>
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{userStats?.usersWithPlans || 0}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Auth Users</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{userStats?.supabaseStats?.totalAuthUsers || 0}</div>
                    <p className="text-xs text-muted-foreground">Supabase Auth</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Recently Active</CardTitle>
                    <UserCheck className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{userStats?.supabaseStats?.recentlyActiveUsers || 0}</div>
                    <p className="text-xs text-muted-foreground">Last 30 days</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Confirmed Users</CardTitle>
                    <UserCheck className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{userStats?.supabaseStats?.confirmedUsers || 0}</div>
                    <p className="text-xs text-muted-foreground">Email verified</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Unconfirmed Users</CardTitle>
                    <UserX className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{userStats?.supabaseStats?.unconfirmedUsers || 0}</div>
                    <p className="text-xs text-muted-foreground">Email not verified</p>
                  </CardContent>
                </Card>
              </div>
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Plan Distribution</CardTitle>
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
          </div>
        </TabsContent>

        <TabsContent value="chat" className="mt-6 -mx-4 -mb-4 sm:-mx-6 sm:-mb-6">
          <AdminChat />
        </TabsContent>
      </main>
    </Tabs>
  )
} 