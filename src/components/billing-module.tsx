import { useEffect, useState } from "react"
import styles from "./billing-module.module.css"
import { getPlans, getUserSubscription, initiatePayment, PlansForFrontend } from "@/app/dashboard/actions"
import { type ErrorResponse } from "../app/dashboard/actions"
import { grotesk } from "@/lib/fonts"
import Image from 'next/image'

export default function BillingModule() {
  const [plans, setPlans] = useState<PlansForFrontend[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ErrorResponse>()
  const [activeSubscription, setActiveSubscription] = useState<any>(null)
  const [processingPayment, setProcessingPayment] = useState(false)

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch subscription status
        const subscriptionResponse = await getUserSubscription()
        if (subscriptionResponse.success) {
          setActiveSubscription(subscriptionResponse.subscription)
        }

        // Fetch available plans
        const plansResponse = await getPlans() 
        if (plansResponse.success) {
          setPlans(plansResponse.plans)
        } else {
          setError(plansResponse)
        }
      } catch (err) {
        const errorResponse: ErrorResponse = {
          success: false,
          error: "Failed to load subscription information",
          errorMessage: "Failed to load subscription information",
          errorCode: null,
        }
        setError(errorResponse)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const handleSubscribe = async (planName: string) => {
    try {
      setProcessingPayment(true)
      const response = await initiatePayment(planName)
      
      if (!response.success) {
        setError(response)
        return
      }

      // Create and submit the PayU form
      const form = document.createElement('form')
      form.method = 'post'
      form.action = 'https://test.payu.in/_payment'

      const addInput = (name: string, value: string) => {
        const input = document.createElement('input')
        input.type = 'hidden'
        input.name = name
        input.value = value
        form.appendChild(input)
      }

      // Add all required PayU fields
      addInput('key', process.env.NEXT_PUBLIC_PAYU_KEY || '')
      addInput('txnid', response.txnId)
      addInput('amount', response.amount.toString())
      addInput('productinfo', response.productInfo)
      addInput('firstname', response.user.name?.split(' ')[0] || '')
      addInput('lastname', response.user.name?.split(' ').slice(1).join(' ') || '')
      addInput('email', response.user.email || '')
      addInput('phone', response.user.phoneNumber)
      addInput('surl', `${process.env.NEXT_PUBLIC_URL}/api/payu-callback`)
      addInput('furl', `${process.env.NEXT_PUBLIC_URL}/api/payu-callback`)
      addInput('hash', response.hash)

      // Submit the form
      document.body.appendChild(form)
      form.submit()
    } catch (err) {
      setError({
        success: false,
        error: "Failed to process payment",
        errorMessage: "Failed to initiate payment. Please try again.",
        errorCode: null,
      })
    } finally {
      setProcessingPayment(false)
    }
  }

  const getPlanColor = (planName: string) => {
    switch(planName.toLowerCase()) {
      case 'professional':
        return '#00A6A6'
      case 'business':
        return '#00A807'
      case 'advanced':
        return '#C800A6'
      default:
        return '#00A6A6'
    }
  }

  const getPlanFeatures = (planName: string) => {
    const baseFeatures = [
      'Form 16',
      'Other income',
      'Tax optimisation',
    ]
    
    const businessFeatures = [
      ...baseFeatures,
      'Multi Form 16\'s',
      'Capital Gains',
    ]
    
    const advancedFeatures = [
      ...businessFeatures,
      'Futures and Options (F&O)',
      'Annual income above 50L',
    ]

    switch(planName.toLowerCase()) {
      case 'professional':
        return {
          included: baseFeatures,
          notIncluded: [
            'Multi Form 16\'s',
            'Capital Gains',
            'Futures and Options (F&O)',
            'Annual income above 50L',
          ]
        }
      case 'business':
        return {
          included: businessFeatures,
          notIncluded: [
            'Futures and Options (F&O)',
            'Annual income above 50L',
          ]
        }
      case 'advanced':
        return {
          included: advancedFeatures,
          notIncluded: []
        }
      default:
        return { included: [], notIncluded: [] }
    }
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingSpinner}>Loading...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.errorMessage}>{error.errorMessage}</div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      {activeSubscription && (
        <div className={styles.activeSubscription}>
          <h2 className={styles.planHeading}>Current Subscription</h2>
          <p>Plan: {activeSubscription.plan.name}</p>
          <p>Valid until: {new Date(activeSubscription.endDate).toLocaleDateString()}</p>
        </div>
      )}
      
      <div className={styles.plansGrid}>
        {plans.map((plan) => {
          const planColor = getPlanColor(plan.name)
          const { included, notIncluded } = getPlanFeatures(plan.name)
          const isBusinessPlan = plan.name.toLowerCase() === 'business'

          return (
            <div 
              key={plan.id} 
              className={`relative flex flex-col items-start p-8 gap-10 flex-1`}
            >
              {isBusinessPlan && (
                <div className="absolute -top-4 left-0 right-0 flex justify-center">
                  <span className={`bg-[#00A807] text-white ${styles.planHeading} px-4 py-1 rounded-full text-sm`}>Most Popular</span>
                </div>
              )}
              <div className={`border-t-4 border-[${planColor}] rounded-t-lg absolute top-0 left-0 right-0`}></div>
              
              <div className="flex flex-col gap-4 w-full">
                <div className="flex items-center space-x-3">
                  <h3 className={`${styles.planName}`} style={{ color: planColor }}>{plan.name}</h3>
                  <Image 
                    src={`/${plan.name === 'Professional' ? '1' : plan.name === 'Business' ? '2' : '3'}.png`}
                    alt={`${plan.name} plan`}
                    width={90.88}
                    height={64}
                    className="w-[90.88px] h-16 object-contain"
                  />
                </div>
                
                <div className={styles.costWrapper}>
                  <span className={styles.planCost}>₹{plan.price}</span>
                  <span className={styles.perYear}>per year</span>
                </div>
              </div>

              <ul className="flex flex-col gap-4 w-full">
                {included.map((feature) => (
                  <li key={feature} className="flex items-center text-gray-700">
                    <svg className={`w-5 h-5 text-[${planColor}] mr-3 flex-shrink-0`} viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                    </svg>
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
                {notIncluded.map((feature) => (
                  <li key={feature} className="flex items-center text-gray-400">
                    <svg className="w-5 h-5 text-gray-400 mr-3 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
                    </svg>
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>

              <button 
                className={`w-full bg-[${planColor}] text-white rounded-lg px-8 py-4 font-medium hover:bg-opacity-90 transition-all duration-200 hover:shadow-lg`}
                disabled={!!activeSubscription || processingPayment}
                onClick={() => handleSubscribe(plan.name)}
              >
                {activeSubscription 
                  ? "Already Subscribed" 
                  : processingPayment 
                    ? "Processing..." 
                    : "Choose Plan"}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
