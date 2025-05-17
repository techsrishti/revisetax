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

  useEffect(() => {
    async function fetchData() {
      try {
        const subscriptionResponse = await getUserSubscription()
        if (subscriptionResponse.success) {
          setActiveSubscription(subscriptionResponse.subscription)
        }

        const plansResponse = await getPlans() 
        if (plansResponse.success) {
          setPlans(plansResponse.plans)
        } else {
          setError(plansResponse)
        }
      } catch (err) {
        setError({
          success: false,
          error: "Failed to load subscription information",
          errorMessage: "Failed to load subscription information",
          errorCode: null,
        })
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
    } finally {
      setProcessingPayment(false)
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

  if (loading) return <div className={styles.loadingSpinner}>Loading...</div>
  if (error) return <div className={styles.errorMessage}>{error.errorMessage}</div>

  return (
    <div className={styles.container}>
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
                className={styles.chooseButton}
                style={{ backgroundColor: planColor }}
                
                disabled={!!activeSubscription || processingPayment}
                onClick={() => handleSubscribe(plan.name)}
              >
                Choose Plan
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
