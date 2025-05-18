import { useEffect, useState } from "react"
import styles from "./billing-module.module.css"
import { getPlans, getUserSubscription, initiatePayment, PlansForFrontend } from "@/app/dashboard/actions"
import { type ErrorResponse } from "../app/dashboard/actions"
import Image from 'next/image'

export default function BillingModule() {
  const [plans, setPlans] = useState<PlansForFrontend[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ErrorResponse>()
  const [activeSubscription, setActiveSubscription] = useState<any>(null)
  const [processingPayment, setProcessingPayment] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)

  useEffect(() => {
    // Fetch plans immediately
    const fetchPlans = async () => {
      try {
        const startTime = Date.now();
        const plansResponse = await getPlans();
        const endTime = Date.now();
        console.log("Time taken to fetch plans: ", endTime - startTime, "ms");
    
        if (plansResponse.success) {
          setPlans(plansResponse.plans);
        } else {
          setError(plansResponse);
        }
      } catch (err) {
        setError({
          success: false,
          error: "Failed to load plans",
          errorMessage: "Could not load plans",
          errorCode: null,
        });
      } finally {
        setLoading(false); // Only here — after plan state is updated
      }
    };
    
  
    // Fetch subscription independently
    const fetchSubscription = async () => {
      try {
        const startTime = Date.now();
        const subscriptionResponse = await getUserSubscription();
        const endTime = Date.now();
        console.log("Time taken to fetch subscription: ", endTime - startTime, "ms");
  
        if (subscriptionResponse.success) {
          setActiveSubscription(subscriptionResponse.subscription);
        }
      } catch {
        // Silent fail or you can log
      }
    };
  
    fetchPlans();         // Trigger immediately
    fetchSubscription();  // Trigger in parallel
  }, []);
  

  const handleSubscribe = async (planName: string) => {
    if (activeSubscription) return; // Prevent subscription if already subscribed
    
    try {
      setProcessingPayment(true)
      setSelectedPlan(planName)
      const response = await initiatePayment(planName)
      
      if (!response.success) {
        setError(response)
        setProcessingPayment(false)
        setSelectedPlan(null)
        return
      }

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

      addInput('key', process.env.NEXT_PUBLIC_PAYU_KEY || '')
      addInput('txnid', response.txnId)
      addInput('amount', response.amount.toString())
      addInput('productinfo', response.productInfo)
      addInput('firstname', response.user.name || '')
      addInput('email', response.user.email || '')
      addInput('phone', response.user.phoneNumber)
      addInput('surl', `${process.env.NEXT_PUBLIC_URL}/api/payu-callback`)
      addInput('furl', `${process.env.NEXT_PUBLIC_URL}/api/payu-callback`)
      addInput('hash', response.hash)

      document.body.appendChild(form)
      form.submit()
    } catch (err) {
      setError({
        success: false,
        error: "Failed to process payment",
        errorMessage: "Failed to initiate payment. Please try again.",
        errorCode: null,
      })
      setProcessingPayment(false)
      setSelectedPlan(null)
    }
  }

  const CheckIcon = ({ color }: { color: string }) => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path 
        d="M7.5 13.5L4 10L5 9L7.5 11.5L13.5 5.5L14.5 6.5L7.5 13.5Z"
        fill={color}
      />
    </svg>
  )

  const CrossIcon = () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path 
        d="M13 7L7 13M7 7L13 13" 
        stroke="#98A2B3" 
        strokeWidth="1.5" 
        strokeLinecap="round" 
        strokeLinejoin="round"
      />
    </svg>
  )

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

  const PaymentProcessingOverlay = () => (
    <div className={styles.paymentProcessingOverlay}>
      <div className={styles.paymentProcessingContent}>
        <div className={styles.paymentProcessingSpinner} />
        <h3 className={styles.paymentProcessingTitle}>Processing Payment</h3>
        <p className={styles.paymentProcessingMessage}>
          Please wait while we redirect you to the payment gateway...
        </p>
      </div>
    </div>
  )

  if (loading) return (
    <div className={styles.container}>
      <div className={styles.skeletonLoading}>
        {[1, 2, 3].map((index) => (
          <div key={index} className={styles.skeletonCard}>
            <div className={styles.skeletonHeader}>
              <div className={styles.skeletonTitle} />
              <div className={styles.skeletonIcon} />
            </div>
            <div className={styles.skeletonPrice} />
            <div className={styles.skeletonFeatures}>
              {[1, 2, 3, 4, 5, 6, 7].map((featureIndex) => (
                <div key={featureIndex} className={styles.skeletonFeature} />
              ))}
            </div>
            <div className={styles.skeletonButton} />
          </div>
        ))}
      </div>
    </div>
  )
  if (error) return <div className={styles.errorMessage}>{error.errorMessage}</div>

  return (
    <div className={styles.container}>
      {processingPayment && <PaymentProcessingOverlay />}
      {activeSubscription && (
        <div className={styles.activeSubscriptionBanner}>
          <h3>Active Subscription</h3>
          <p>You currently have an active subscription to the {activeSubscription.planName} plan.</p>
        </div>
      )}
      <div className={styles.plansGrid}>
        {plans.map((plan) => {
          const planColor = getPlanColor(plan.name)
          const features = [
            { name: 'Form 16', included: true },
            { name: 'Other income', included: true },
            { name: 'Tax optimisation', included: true },
            { name: 'Multi Form 16\'s', included: plan.name !== 'Professional' },
            { name: 'Capital Gains', included: plan.name !== 'Professional' },
            { name: 'Futures and Options (F&O)', included: plan.name === 'Advanced' },
            { name: 'Annual income above 50L', included: plan.name === 'Advanced' },
          ]

          const isCurrentPlan = activeSubscription?.planName === plan.name

          return (
            <div key={plan.id} className={styles.planCard}>
              <div className={styles.headerSection}>
                <div className={styles.headerContent}>
                  <h3 className={styles.planName} style={{ color: planColor }}>{plan.name}</h3>
                  <Image 
                    src={`/${plan.name === 'Professional' ? '1' : plan.name === 'Business' ? '2' : '3'}.png`}
                    alt={`${plan.name} plan`}
                    width={100}
                    height={70}
                    className={styles.planIcon}
                  />
                </div>

                <div className={styles.pricingSection}>
                  <div className={styles.costWrapper}>
                    <span className={styles.planCost}>₹{plan.price}</span>
                    <span className={styles.perYear}>per year</span>
                  </div>
                </div>
              </div>

              <ul className={styles.featureList}>
                {features.map((feature) => (
                  <li key={feature.name} className={`${styles.featureItem} ${feature.included ? styles.included : styles.notIncluded}`}>
                    {feature.included ? <CheckIcon color={planColor} /> : <CrossIcon />}
                    <span>{feature.name}</span>
                  </li>
                ))}
              </ul>

              <button 
                className={`${styles.chooseButton} ${isCurrentPlan ? styles.currentPlanButton : ''}`}
                style={{ backgroundColor: isCurrentPlan ? '#E5E7EB' : planColor }}
                disabled={!!activeSubscription || processingPayment}
                onClick={() => handleSubscribe(plan.name)}
              >
                {isCurrentPlan ? 'Current Plan' : 'Choose Plan'}
              </button>
            </div>
          )
        })}
      </div>
      
      <div className={styles.bulkDiscountSection}>
        <div>
          <h4 className={styles.bulkDiscountTitle}>Want to get bulk discount?</h4>
          <p className={styles.bulkDiscountDescription}>
            We offer discounts in bulk when you invite your friends or family to file taxes via us
          </p>
        </div>
        <button className={styles.letsTalkButton}>Let's Talk</button>
      </div>
    </div>
  )
}
