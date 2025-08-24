import { useEffect, useState } from "react"
import styles from "./billing-module.module.css"
import { getPlans, getUserSubscription, initiatePayment, PlansForFrontend } from "@/app/dashboard/actions"
import { type ErrorResponse } from "../app/dashboard/actions"
import Image from 'next/image'
import { useToast } from "@/hooks/use-toast"
import { Toaster } from "@/components/ui/toaster"

export default function BillingModule() {
  const { toast } = useToast()
  const [plans, setPlans] = useState<PlansForFrontend[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ErrorResponse>()
  const [activeSubscription, setActiveSubscription] = useState<any>(null)
  const [processingPayment, setProcessingPayment] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)
  const [paymentError, setPaymentError] = useState<string | null>(null)

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
          toast({
            title: "Error Loading Plans",
            description: plansResponse.errorMessage || "Failed to load subscription plans",
            variant: "destructive",
            duration: 4000,
          });
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to load plans";
        setError({
          success: false,
          error: "Failed to load plans",
          errorMessage: errorMessage,
          errorCode: null,
        });
        toast({
          title: "Error Loading Plans",
          description: errorMessage,
          variant: "destructive",
          duration: 4000,
        });
      } finally {
        setLoading(false);
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
        } else {
          toast({
            title: "Error Loading Subscription",
            description: subscriptionResponse.errorMessage || "Failed to load subscription details",
            variant: "destructive",
            duration: 4000,
          });
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to load subscription";
        toast({
          title: "Error Loading Subscription",
          description: errorMessage,
          variant: "destructive",
          duration: 4000,
        });
      }
    };
  
    fetchPlans();
    fetchSubscription();
  }, [toast]);

  const handleSubscribe = async (planName: string) => {
    if (activeSubscription) return;
    
    try {
      setProcessingPayment(true)
      setSelectedPlan(planName)
      setPaymentError(null) // Clear any previous payment errors
      const response = await initiatePayment(planName)
      
      if (!response.success) {
        setPaymentError(response.errorMessage || "Failed to initiate payment")
        toast({
          title: "Payment Initiation Failed",
          description: response.errorMessage || "Failed to initiate payment",
          variant: "destructive",
          duration: 4000,
        });
        setProcessingPayment(false)
        setSelectedPlan(null)
        return
      }

      const form = document.createElement('form')
      form.method = 'post'
      form.action = 'https://secure.payu.in/_payment'

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
      const errorMessage = err instanceof Error ? err.message : "Failed to process payment";
      setPaymentError(errorMessage)
      toast({
        title: "Payment Error",
        description: errorMessage,
        variant: "destructive",
        duration: 4000,
      });
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

  if (error) return (
    <div className={styles.container}>
      <div className={styles.errorMessage}>{error.errorMessage}</div>
    </div>
  )

  return (
    <div className={styles.container}>
      {processingPayment && <PaymentProcessingOverlay />}
      {paymentError && (
        <div className={styles.paymentErrorBanner}>
          <div className={styles.paymentErrorContent}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className={styles.errorIcon}>
              <path d="M10 6.66667V10M10 13.3333H10.0083M18.3333 10C18.3333 14.6024 14.6024 18.3333 10 18.3333C5.39763 18.3333 1.66667 14.6024 1.66667 10C1.66667 5.39763 5.39763 1.66667 10 1.66667C14.6024 1.66667 18.3333 5.39763 18.3333 10Z" stroke="#DC2626" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <p className={styles.paymentErrorMessage}>{paymentError}</p>
            <button 
              onClick={() => setPaymentError(null)} 
              className={styles.closeErrorButton}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M15 5L5 15M5 5L15 15" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      )}
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
        <button 
          className={styles.letsTalkButton}
          onClick={() => window.open('https://book.revisetax.com/team/tax-experts/book-a-call', '_blank')}
        >
          Let's Talk
        </button>
      </div>
      <Toaster />
    </div>
  )
}
