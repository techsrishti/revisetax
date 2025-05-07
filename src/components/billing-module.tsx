import { useEffect, useState } from "react"
import styles from "./billing-module.module.css"
import { getPlans, getUserSubscription, initiatePayment, PlansForFrontend } from "@/app/dashboard/actions"
import { type ErrorResponse } from "../app/dashboard/actions"
import { grotesk } from "@/lib/fonts"

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
      addInput('phone', response.user.phone)
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
          <h2>Current Subscription</h2>
          <p>Plan: {activeSubscription.plan.name}</p>
          <p>Valid until: {new Date(activeSubscription.endDate).toLocaleDateString()}</p>
        </div>
      )}
      
      <div className={styles.plansGrid}>
        {plans.map((plan) => (
          <div key={plan.id} className={styles.planCard}>
            <h3 className={styles.planName}>{plan.name}</h3>
            <div className={styles.planPrice}>₹{plan.price}</div>
            
            <div className={styles.features}>
              {Object.entries(plan.features).map(([feature, included]) => (
                <div key={feature} className={styles.feature}>
                  <span className={included ? styles.included : styles.notIncluded}>
                    {included ? "✓" : "✕"}
                  </span>
                  {feature}
                </div>
              ))}
            </div>

            <button 
              className={styles.subscribeButton}
              disabled={!!activeSubscription || processingPayment}
              onClick={() => handleSubscribe(plan.name)}
            >
              {activeSubscription 
                ? "Already Subscribed" 
                : processingPayment 
                  ? "Processing..." 
                  : "Subscribe Now"}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
