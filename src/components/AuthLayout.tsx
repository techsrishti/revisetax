import Image from 'next/image';
import styles from '@/app/auth/styles.module.css';

interface AuthLayoutProps {
  children: React.ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="relative min-h-screen w-full bg-white">
      {/* Background Elements */}
      <div className="fixed inset-0 z-0 overflow-hidden">
        <div className={`${styles['hero-bg']} hidden sm:block`}></div>
        <div className={`${styles['hero-rectangle-1']} hidden sm:block`}></div>
        <div className={`${styles['hero-rectangle-2']} hidden sm:block`}></div>
        {/* Mobile-specific background */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#1E293B] to-[#0F172A] sm:hidden"></div>
      </div>

      <main className="relative z-10 min-h-screen flex flex-col">
        {/* Header */}
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <header className="mx-auto max-w-7xl mt-4 sm:mt-[28px] flex flex-col sm:flex-row justify-between items-center gap-4 sm:gap-0">
            {/* Logo */}
            <div className="flex-shrink-0 mb-4 sm:mb-0">
              <Image
                src="/logo-top-login.svg"
                alt="ReviseTax"
                width={120}
                height={32}
                priority
                className="h-8 sm:h-10 w-auto"
              />
            </div>

            {/* Contact Information */}
            <div className="flex flex-col gap-3 sm:gap-2 w-full sm:w-auto px-4 sm:px-0">
              <div className="flex items-center justify-center sm:justify-start gap-2 bg-white/5 sm:bg-transparent p-2 sm:p-0 rounded-lg">
                <Image
                  src="/call.svg"
                  alt="Phone"
                  width={20}
                  height={20}
                  className="w-4 sm:w-5 h-4 sm:h-5"
                />
                <a 
                  href="tel:+919555394443" 
                  className="font-inter text-[13px] sm:text-sm font-semibold leading-5 text-white sm:text-[#C1D2E1] hover:text-[#FF4400] transition-colors duration-200"
                >
                  Call directly at +919555394443
                </a>
              </div>
              <div className="flex items-center justify-center sm:justify-start gap-2 bg-white/5 sm:bg-transparent p-2 sm:p-0 rounded-lg">
                <Image
                  src="/mail.svg"
                  alt="Email"
                  width={20}
                  height={20}
                  className="w-4 sm:w-5 h-4 sm:h-5"
                />
                <a 
                  href="mailto:contact@revisetax.com" 
                  className="font-inter text-[13px] sm:text-sm font-semibold leading-5 text-white sm:text-[#C1D2E1] hover:text-[#FF4400] transition-colors duration-200"
                >
                  contact@revisetax.com
                </a>
              </div>
            </div>
          </header>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex items-center justify-center p-4 sm:px-6 sm:py-8 lg:px-8">
          <div className="w-full max-w-[90%] sm:max-w-md">
            {children}
          </div>
        </div>

        {/* Mobile Bottom Padding for better UX */}
        <div className="h-8 sm:h-0"></div>
      </main>
    </div>
  );
}