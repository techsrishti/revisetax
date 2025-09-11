import Image from 'next/image';
import { useRouter } from 'next/navigation';
import styles from '@/app/auth/styles.module.css';

interface AuthLayoutProps {
  children: React.ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  const router = useRouter();

  const handleLogoClick = () => {
    router.push('https://revisetax.com');
  };

  return (
    <div className="relative min-h-screen w-full bg-[#0F172A] overflow-y-auto">
      {/* Background Elements */}
      <div className="fixed inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0F172A] to-[#1E293B]" />
        <div className={styles.heroBg} />
        <div className={styles.heroRectangle1} />
        <div className={styles.heroRectangle2} />
      </div>

      <main className="relative z-10 min-h-screen flex flex-col">
        {/* Header */}
        <div className="w-full px-4 sm:px-6 py-4 sm:py-6">
          <header className="mx-auto max-w-7xl flex flex-col sm:flex-row justify-between items-center sm:items-start gap-4">
            {/* Logo */}
            <div className="flex-shrink-0">
              <Image
                src="/logo-top-login.svg"
                alt="ReviseTax"
                width={140}
                height={40}
                priority
                className="h-8 w-auto cursor-pointer"
                onClick={handleLogoClick}
              />
            </div>

            {/* Contact Information - Stacked Vertically */}
            <div className="flex flex-col items-center sm:items-end gap-2 text-center sm:text-right">
              <a 
                href="tel:+919133787722" 
                className="flex items-center gap-2 text-[#C1D2E1] hover:text-[#FF4400] transition-colors duration-200 whitespace-nowrap"
              >
                <Image
                  src="/call.svg"
                  alt="Phone"
                  width={20}
                  height={20}
                  className="w-5 h-5 opacity-80"
                />
                <span className="font-inter text-[14px] leading-[20px] font-normal tracking-[0%]">
                  Call directly at <strong>+919133787722</strong>
                </span>
              </a>
              <a 
                href="mailto:contact@revisetax.com" 
                className="flex items-center gap-2 text-[#C1D2E1] hover:text-[#FF4400] transition-colors duration-200 whitespace-nowrap"
              >
                <Image
                  src="/mail.svg"
                  alt="Email"
                  width={20}
                  height={20}
                  className="w-5 h-5 opacity-80"
                />
                <span className="font-inter text-[14px] leading-[20px] font-normal tracking-[0%]">
                  contact@revisetax.com
                </span>
              </a>
            </div>
          </header>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex items-center justify-center p-4 sm:px-6">
          <div className="w-full max-w-[472px] sm:-mt-12">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}