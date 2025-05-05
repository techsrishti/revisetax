import styles from "./billing-module.module.css"

export default function BillingModule() {
  return (
    <div className={styles.container}>
      <div className={styles.comingSoonCard}>
        <h2 className={styles.title}>Coming Soon</h2>
        <p className={styles.description}>
          The billing module is currently under development and will be available soon.
        </p>
      </div>
    </div>
  )
}
