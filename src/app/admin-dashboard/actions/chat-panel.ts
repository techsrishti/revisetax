"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"

// Action to get detailed information for a specific chat
export async function getChatDetails(chatId: string) {
  try {
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        user: {
          include: {
            Subscription: {
              include: {
                Plan: true,
              },
            },
          },
        },
        messages: {
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    })
    return { success: true, chat }
  } catch (error) {
    console.error("Error in getChatDetails:", error)
    return { success: false, error: "Failed to fetch chat details." }
  }
}

// Action to fetch a user's uploaded documents
export async function getUserDocuments(userId: string) {
  try {
    const folders = await prisma.folder.findMany({
      where: { userId },
      include: {
        File: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    })
    return { success: true, folders }
  } catch (error) {
    console.error("Error in getUserDocuments:", error)
    return { success: false, error: "Failed to fetch documents." }
  }
}

// Action to create a ticket in osTicket
export async function createOsTicket(params: {
  name: string
  email: string
  subject: string
  message: string
  userId: string
  attachments?: { [key: string]: string }[]
}) {
  try {
    const requestBody: any = {
      name: params.name,
      email: params.email,
      subject: params.subject,
      message: `data:text/plain,${params.message}`,
      ip: process.env.REVISE_TAX_INSTANCE_IP || "203.115.69.190", // Use environment variable with fallback
      source: "API",
    }

    // Add attachments if provided
    if (params.attachments && params.attachments.length > 0) {
      requestBody.attachments = params.attachments
    }

    const response = await fetch("https://support.revisetax.com/api/tickets.json", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": process.env.OSTICKET_API_KEY!,
      },
      body: JSON.stringify(requestBody),
    })
    if (!response.ok) {
      throw new Error(`osTicket API responded with status ${response.status}`)
    }
    const ticketId = await response.text()
    
    // Store ticket information in database
    const ticketDetails = {
      name: params.name,
      email: params.email,
      subject: params.subject,
      message: params.message,
      osTicketId: ticketId,
      createdAt: new Date().toISOString(),
      status: 'open', // Default status
      attachments: params.attachments || []
    }
    
    await prisma.osTicket.create({
      data: {
        userId: params.userId,
        osTicketId: ticketId,
        details: ticketDetails
      }
    })
    
    return { success: true, ticketId }
  } catch (error) {
    console.error("Error in createOsTicket:", error)
    return { success: false, error: "Failed to create osTicket ticket." }
  }
}

// Action to get user's osTickets
export async function getUserOsTickets(userId: string) {
  try {
    const tickets = await prisma.osTicket.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }, // Show highest number ID at top (most recent first)
      select: {
        id: true,
        osTicketId: true,
        details: true,
        createdAt: true,
        updatedAt: true
      }
    })
    
    return { success: true, tickets: tickets || [] }
  } catch (error) {
    console.error("Error in getUserOsTickets:", error)
    return { success: false, error: "Failed to fetch osTickets.", tickets: [] }
  }
}

// Action to create a contact and ticket in HubSpot
export async function createHubspotTicket(params: {
  firstname: string
  lastname: string
  email: string
  phone: string
  subject: string
  message: string
}) {
  const hubspotApiUrl = "https://api.hubapi.com/crm/v3/objects"
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.HUBSPOT_API_KEY!}`,
  }

  try {
    // Step 1: Create or get contact
    let contactId: string | null = null;
    // For simplicity, we create a new contact every time.
    // In a real application, you should search for an existing contact by email first.
    const contactResponse = await fetch(`${hubspotApiUrl}/contacts`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        properties: {
          email: params.email,
          firstname: params.firstname,
          lastname: params.lastname,
          phone: params.phone,
          company: "ReviseTax",
          website: "revisetax.com",
          lifecyclestage: "subscriber",
        },
      }),
    })
    
    if (!contactResponse.ok) {
        const errorBody = await contactResponse.json();
        console.error("HubSpot contact creation failed:", errorBody);
        throw new Error(`HubSpot API (contacts) responded with status ${contactResponse.status}`);
    }
    const contactData = await contactResponse.json()
    contactId = contactData.id

    // Step 2: Create ticket and associate with the contact
    const ticketResponse = await fetch(`${hubspotApiUrl}/tickets`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        properties: {
          hs_pipeline: "0",
          hs_pipeline_stage: "1",
          hs_ticket_priority: "HIGH",
          subject: params.subject,
          content: params.message
        },
        associations: [
          {
            to: { id: contactId },
            types: [{
              associationCategory: "HUBSPOT_DEFINED",
              associationTypeId: 16 // Contact to Ticket association
            }]
          }
        ]
      }),
    })
    
    if (!ticketResponse.ok) {
        const errorBody = await ticketResponse.json();
        console.error("HubSpot ticket creation failed:", errorBody);
        throw new Error(`HubSpot API (tickets) responded with status ${ticketResponse.status}`);
    }

    const ticketData = await ticketResponse.json()
    return { success: true, ticketId: ticketData.id }

  } catch (error) {
    console.error("Error in createHubspotTicket:", error)
    return { success: false, error: "Failed to create HubSpot ticket." }
  }
}

// Action to assign a chat to an admin
export async function assignChatToAdmin(chatId: string, adminId: string) {
  try {
    const chat = await prisma.chat.update({
      where: { id: chatId },
      data: { 
        adminId: adminId,
        status: 'ACTIVE',
        updatedAt: new Date()
      },
      include: {
        user: {
          select: {
            name: true,
            email: true,
            phoneNumber: true
          }
        },
        admin: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    })
    
    revalidatePath("/admin-dashboard")
    return { success: true, chat }
  } catch (error) {
    console.error("Error in assignChatToAdmin:", error)
    return { success: false, error: "Failed to assign chat to admin." }
  }
} 