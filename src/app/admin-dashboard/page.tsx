"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/utils/supabase/client"
import AdminChat from "./components/admin-chat"

export default function AdminDashboard() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          router.push("/auth/signin")
          return
        }

        // Check if user is admin_1
        const { data: dbUser } = await supabase
          .from("users")
          .select("id")
          .eq("supabase_user_id", user.id)
          .single()



        setIsLoading(false)
      } catch (error) {
        console.error("Error checking admin status:", error)
        router.push("/auth/signin")
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
    <div className="min-h-screen bg-white">
      <AdminChat />
    </div>
  )
} 