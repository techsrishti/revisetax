"use server"

import { createClient } from "@/utils/supabase/server"

export interface AIRefineResponse {
  success: boolean
  refinedText?: string
  error?: string
}

export async function refineMessageWithAI(originalText: string): Promise<AIRefineResponse> {
  try {
    // Check if admin is authenticated
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return {
        success: false,
        error: 'Not authenticated'
      }
    }

    // Verify user is an admin
    const userEmail = user.email?.toLowerCase()
    const isAdmin = userEmail?.includes('admin') || userEmail?.endsWith('@revisetax.com')
    if (!isAdmin) {
      return {
        success: false,
        error: 'Unauthorized: User is not an admin'
      }
    }

    // Check if OpenAI API key is available
    const openaiApiKey = process.env.OPENAI_API_KEY
    if (!openaiApiKey) {
      return {
        success: false,
        error: 'OpenAI API key not configured'
      }
    }

    // Call OpenAI API to refine the text
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `You are a professional customer service assistant for ReviseTax, a tax preparation service. 
            Your task is to refine customer service messages to make them more professional, clear, and helpful while maintaining the original intent and tone.
            
            Guidelines:
            - Keep the message concise and clear
            - Use professional but friendly language
            - Maintain empathy and helpfulness
            - Ensure proper grammar and spelling
            - Keep the same meaning and intent as the original
            - If the original is already professional, make minimal changes
            - Focus on clarity and professionalism`
          },
          {
            role: 'user',
            content: `Please refine this customer service message to make it more professional: "${originalText}"`
          }
        ],
        max_tokens: 200,
        temperature: 0.7
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('OpenAI API error:', errorData)
      return {
        success: false,
        error: `OpenAI API error: ${response.status} ${response.statusText}`
      }
    }

    const data = await response.json()
    const refinedText = data.choices?.[0]?.message?.content?.trim()

    if (!refinedText) {
      return {
        success: false,
        error: 'No response from AI service'
      }
    }

    return {
      success: true,
      refinedText
    }

  } catch (error) {
    console.error('Error in refineMessageWithAI:', error)
    return {
      success: false,
      error: 'Failed to refine message. Please try again.'
    }
  }
} 