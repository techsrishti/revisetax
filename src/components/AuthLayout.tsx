import Image from 'next/image';
import { inter, grotesk } from '@/lib/fonts';
import styles from '@/app/auth/styles.module.css';

interface AuthLayoutProps {
  children: React.ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className={`${styles.authLayoutContainer} ${inter.variable} ${grotesk.variable}`}>
      {/* Background Elements */}
      <div className={styles.backgroundElements}>
        <div className={styles.backgroundGradient} />
        <div className={styles.heroBg} />
        <div className={styles.heroRectangle1} />
        <div className={styles.heroRectangle2} />
      </div>

      <main className={styles.mainContent}>
        {/* Header */}
        <div className={styles.headerContainer}>
          <header className={styles.header}>
            {/* Logo */}
            <div className={styles.logoContainer}>
              <Image
                src="/logo-top-login.svg"
                alt="ReviseTax"
                width={140}
                height={40}
                priority
                className={styles.logo}
              />
            </div>

            {/* Contact Information - Stacked Vertically */}
            <div className={styles.contactInfo}>
              <a 
                href="tel:+919555394443" 
                className={styles.contactLink}
              >
                <Image
                  src="/call.svg"
                  alt="Phone"
                  width={20}
                  height={20}
                  className={styles.contactIcon}
                />
                <span className={styles.contactText}>
                  Call directly at <strong>+919555394443</strong>
                </span>
              </a>
              <a 
                href="mailto:contact@revisetax.com" 
                className={styles.contactLink}
              >
                <Image
                  src="/mail.svg"
                  alt="Email"
                  width={20}
                  height={20}
                  className={styles.contactIcon}
                />
                <span className={styles.contactText}>
                  contact@revisetax.com
                </span>
              </a>
            </div>
          </header>
        </div>

        {/* Main Content */}
        <div className={styles.contentContainer}>
          <div className={styles.contentWrapper}>
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}