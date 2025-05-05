import Image from 'next/image';
import styles from '../styles.module.css';

interface AuthLayoutProps {
  children: React.ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="relative min-h-screen w-full">
      <div className="hero-section">
        <div className={styles['hero-bg']}></div>
        <div className={styles['hero-rectangle-1']}></div>
        <div className={styles['hero-rectangle-2']}></div>
      </div>

      <main className="min-h-screen relative overflow-hidden flex flex-col">
        {/* Header */}
        <div className="relative flex justify-center">
          <header className="relative w-[1200px] h-[48px] mt-[28px] flex justify-between items-center font-inter">
            <div>
              <Image
                src="/logo-top-login.svg"
                alt="ReviseTax"
                width={150}
                height={40}
                priority
                className="h-10 w-auto"
              />
            </div>
            <div className="w-[242px] h-[48px] flex flex-col justify-center gap-2">
              <div className="flex items-center gap-2">
                <Image
                  src="/call.svg"
                  alt="Phone"
                  width={20}
                  height={20}
                />
                <a href="tel:+919555394443" className="font-inter text-sm font-semibold leading-5 text-[#C1D2E1] hover:text-[#FF4400] transition-colors">
                  Call directly at +919555394443
                </a>
              </div>
              <div className="flex items-center gap-2">
                <Image
                  src="/mail.svg"
                  alt="Email"
                  width={20}
                  height={20}
                />
                <a href="mailto:contact@revisetax.com" className="font-inter text-sm font-semibold leading-5 text-[#C1D2E1] hover:text-[#FF4400] transition-colors">
                  contact@revisetax.com
                </a>
              </div>
            </div>
          </header>
        </div>

        {/* Content */}
        <div className="flex-1 flex items-center justify-center">
          {children}
        </div>
      </main>
    </div>
  );
}