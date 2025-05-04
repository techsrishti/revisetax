import { Button } from "@/components/ui/button"
import { Check, X } from "lucide-react"
import styles from "./plans-module.module.css"

export default function PlansModule() {
  const plans = [
    {
      name: "Professional",
      price: "₹1,499",
      color: "#00A3B5",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M4 8H20M4 16H20M6 20H18C19.1046 20 20 19.1046 20 18V6C20 4.89543 19.1046 4 18 4H6C4.89543 4 4 4.89543 4 6V18C4 19.1046 4.89543 20 6 20Z"
            stroke="#00A3B5"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
      features: [
        { name: "Form 16", included: true },
        { name: "Other income", included: true },
        { name: "Tax optimisation", included: true },
        { name: "Multi Form 16's", included: false },
        { name: "Capital Gains", included: false },
        { name: "Futures and Options (F&O)", included: false },
        { name: "Annual income above 50L", included: false },
      ],
    },
    {
      name: "Business",
      price: "₹4,999",
      color: "#00B050",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M16 8L8 16M12 12L16 16M8 8L10 10M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z"
            stroke="#00B050"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
      features: [
        { name: "Form 16", included: true },
        { name: "Other income", included: true },
        { name: "Tax optimisation", included: true },
        { name: "Multi Form 16's", included: true },
        { name: "Capital Gains", included: true },
        { name: "Futures and Options (F&O)", included: false },
        { name: "Annual income above 50L", included: false },
      ],
    },
    {
      name: "Advanced",
      price: "₹9,999",
      color: "#C5007F",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M21 9L14.5 15.5L12 13M9 11L6 14M3 21H21M16.5 3.5L17.5 4.5M21 8H19M16.5 12.5L17.5 11.5M8 3L12 7L8 11L4 7L8 3Z"
            stroke="#C5007F"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
      features: [
        { name: "Form 16", included: true },
        { name: "Other income", included: true },
        { name: "Tax optimisation", included: true },
        { name: "Multi Form 16's", included: true },
        { name: "Capital Gains", included: true },
        { name: "Futures and Options (F&O)", included: true },
        { name: "Annual income above 50L", included: true },
      ],
    },
  ]

  return (
    <div className={styles.container}>
      <div className={styles.plansGrid}>
        {plans.map((plan, index) => (
          <div key={index} className={styles.planCard}>
            <div className={styles.planHeader}>
              <div>
                <h3 className={styles.planName} style={{ color: plan.color }}>
                  {plan.name}
                </h3>
                <div className={styles.planPrice}>
                  <span className={styles.priceAmount}>{plan.price}</span>
                  <span className={styles.pricePeriod}>per year</span>
                </div>
              </div>
              <div className={styles.planIcon} style={{ color: plan.color }}>
                {plan.icon}
              </div>
            </div>

            <div className={styles.featuresList}>
              {plan.features.map((feature, i) => (
                <div key={i} className={styles.featureItem}>
                  {feature.included ? (
                    <Check className={styles.featureIncluded} />
                  ) : (
                    <X className={styles.featureExcluded} />
                  )}
                  <span className={styles.featureName}>{feature.name}</span>
                </div>
              ))}
            </div>

            <Button
              className={styles.planButton}
              style={{
                backgroundColor: plan.color,
              }}
            >
              Choose Plan
            </Button>
          </div>
        ))}
      </div>

      <div className={styles.discountCard}>
        <div className={styles.discountHeader}>
          <h3 className={styles.discountTitle}>Want to get bulk discount?</h3>
        </div>
        <div className={styles.discountContent}>
          <p className={styles.discountDescription}>
            We offer discounts in bulk when you invite your friends or family to file taxes via us
          </p>
          <Button className={styles.talkButton}>Let's Talk</Button>
        </div>
      </div>
    </div>
  )
}
