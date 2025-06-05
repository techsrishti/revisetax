"use client"

import { useState } from "react"
import ChatModule from "@/components/chat-module"
import PlansModule from "@/components/plans-module"
 import BillingModule from "@/components/billing-module"
import Sidebar from "@/components/sidebar"
import styles from "./styles.module.css"
import Documents from "@/components/documents"

export default function Dashboard() {
  const [activeModule, setActiveModule] = useState("chat")

  return (
    <div className={styles.container}>
      <Sidebar activeModule={activeModule} setActiveModule={setActiveModule} />
      <div className={styles.content}>
        {activeModule === "chat" && <ChatModule />}
        {activeModule === "documents" && <Documents />}
        {activeModule === "plans" && <BillingModule />}
        {activeModule === "billing" && <PlansModule />}
      </div>
    </div>
  )
}
