import { useEffect, useState } from "react"
import styles from "./billing-module.module.css"
import { getPlans, getUserSubscription, PlansForFrontend,  } from "@/app/dashboard/actions"
import { type PlansSuccessResponse, type ErrorResponse } from "../app/dashboard/actions"

export default function BillingModule() {
  const [plans, setPlans] = useState<PlansForFrontend[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ErrorResponse>()
  const [activeSubscription, setActiveSubscription] = useState<any>(null)

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
              disabled={!!activeSubscription}
            >
              {activeSubscription ? "Already Subscribed" : "Subscribe Now"}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
