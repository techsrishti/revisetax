"use client"

import { useState } from "react"
import ChatModule from "@/components/chat-module"
import PlansModule from "@/components/plans-module"
import DocumentsModule from "@/components/documents-module"
import BillingModule from "@/components/billing-module"
import Sidebar from "@/components/sidebar"
import styles from "./styles.module.css"

export default function Dashboard() {
  const [activeModule, setActiveModule] = useState("chat")

  return (
    <div className={styles.container}>
      <Sidebar activeModule={activeModule} setActiveModule={setActiveModule} />
      <div className={styles.content}>
        {activeModule === "chat" && <ChatModule />}
        {activeModule === "documents" && <DocumentsModule />}
        {activeModule === "plans" && <PlansModule />}
        {activeModule === "billing" && <BillingModule />}
      </div>
    </div>
  )
}
