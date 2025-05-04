import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ExternalLink } from "lucide-react"
import styles from "./chat-module.module.css"

export default function ChatModule() {
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {/* Chat prompt */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>What do you need help with?</h2>
          </div>
          <p className={styles.cardDescription}>
            We want to learn more about your interests so we can connect you with the most relevant expert.
          </p>

          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Trending</h3>
            <div className={styles.checkboxItem}>
              <Checkbox id="itr-tax-filing" className={styles.checkbox} defaultChecked />
              <div className={styles.checkboxContent}>
                <label htmlFor="itr-tax-filing" className={styles.checkboxLabel}>
                  ITR Tax Filing
                </label>
              </div>
            </div>
            <p className={styles.subLabel}>Income Tax Returns 2023 - 2024</p>
          </div>

          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Others</h3>
            <div className={styles.checkboxGroup}>
              <div className={styles.checkboxItem}>
                <Checkbox id="loans-products" className={styles.checkbox} />
                <label htmlFor="loans-products" className={styles.checkboxLabel}>
                  Loans & Products
                </label>
              </div>
              <div className={styles.checkboxItem}>
                <Checkbox id="financial-advisory" className={styles.checkbox} />
                <label htmlFor="financial-advisory" className={styles.checkboxLabel}>
                  Financial Advisory
                </label>
              </div>
            </div>
          </div>

          <Button className={styles.primaryButton}>Start the Chat</Button>
        </div>

        {/* Schedule call */}
        <div className={styles.card}>
          <h2 className={styles.callTitle}>Schedule a call instead?</h2>
          <p className={styles.callDescription}>
            For people who need tailored services based on your use case, please schedule a call with us.
          </p>
          <Button variant="outline" className={styles.scheduleButton}>
            <ExternalLink className={styles.scheduleIcon} />
            Schedule a Call
          </Button>
        </div>
      </div>
    </div>
  )
}
