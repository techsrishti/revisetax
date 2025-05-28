"use client"

import { useState, useEffect } from "react"
import type React from "react"
import styles from "./sidebar.module.css"
import { createClient } from "@/utils/supabase/client"
import { useRouter } from "next/navigation"

interface SidebarProps {
  activeModule: string
  setActiveModule: (module: string) => void
  children?: React.ReactNode
}

export default function Sidebar({ activeModule, setActiveModule, children }: SidebarProps) {
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const router = useRouter();
  
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        setUser(user);
      } catch (error) {
        console.error('Error fetching user:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUser();
  }, []);

  const handleProfileClick = () => {
    setIsOverlayOpen(true);
  };
  
  const handleEditProfileClick = () => {
    setIsModalOpen(true);
    // This would typically open a modal with animation
  };

  const handleLogout = async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push('/auth');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const handleBackdropClick = () => {
    setIsMobileMenuOpen(false);
  };
  
  return (
    <>
      {/* Mobile Header - Fixed at top */}
      <div className={styles.mobileHeader}>
        <button 
          className={styles.mobileMenuButton}
          onClick={toggleMobileMenu}
          aria-label="Toggle menu"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 6h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            <path d="M4 12h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            <path d="M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
        <img src="/revise-tax-logo.svg" alt="Revise Tax" className={styles.mobileLogo} />
      </div>

      {/* Content Wrapper - Starts below header */}
      <div className={styles.contentWrapper}>
        {/* Backdrop */}
        {isMobileMenuOpen && (
          <div className={`${styles.backdrop} ${styles.show}`} onClick={handleBackdropClick} />
        )}

        {/* Sidebar */}
        <div className={`${styles.sidebar} ${isMobileMenuOpen ? styles.open : ''}`}>
          <div className={styles.userProfile} onClick={handleProfileClick}>
            <div className={styles.avatar}>
              <img 
                src={user?.user_metadata?.avatar_url || "/Alborz.svg"} 
                className={styles.avatarImage} 
              />
            </div>
            <div className={styles.userInfo}>
              {isLoading ? (
                <div className={styles.loadingSpinner} />
              ) : (
                <p className={styles.userName}>
                  {user?.user_metadata?.full_name || user?.email || 'User'}
                </p>
              )}
              <img src="/chevron-down-icon.svg" alt="Expand" className={styles.chevron} width={8} height={8} />
            </div>
          </div>

          {isOverlayOpen && (
            <div 
              className={styles.overlay}
              onClick={() => setIsOverlayOpen(false)}
            >
              <div className={styles.overlayContent} onClick={e => e.stopPropagation()}>
                <button className={styles.overlayItem} onClick={handleEditProfileClick}>
                  <div className={styles.itemStartIcon}>
                    <img src="/edit-profile.svg" alt="Edit" width={20} height={20} />
                  </div>
                  <span className={styles.itemText}>Edit Profile</span>
                </button>
                <button className={styles.overlayItem} onClick={handleLogout}>
                  <div className={styles.itemStartIcon}>
                    <img src="/logout-icon.svg" alt="Logout" width={20} height={20} />
                  </div>
                  <span className={styles.itemTextLogout}>Logout</span>
                </button>
              </div>
            </div>
          )}

          {/* Modal would be implemented here */}

          <nav className={styles.nav}>
            <ul className={styles.navList}>
              <SidebarItem
                icon={<img src="/chat-icon.svg" alt="Chat" width={16.75} height={16.67} />}
                label="Chat"
                isActive={activeModule === "chat"}
                onClick={() => {
                  setActiveModule("chat");
                  setIsMobileMenuOpen(false);
                }}
              />
              <SidebarItem
                icon={<img src="/document-icon.svg" alt="Documents" width={16.75} height={16.67} />}
                label="Documents"
                isActive={activeModule === "documents"}
                onClick={() => {
                  setActiveModule("documents");
                  setIsMobileMenuOpen(false);
                }}
              />
              <SidebarItem
                icon={<img src="/plans-icon.svg" alt="Plans" width={16.75} height={16.67} />}
                label={ "Plans"}
                isActive={activeModule === "plans"}
                onClick={() => {
                  setActiveModule("plans");
                  setIsMobileMenuOpen(false);
                }}
              />
              <SidebarItem
                icon={<img src="/billing-icon.svg" alt="Billing" width={16.75} height={16.67} />}
                label="Billing"
                isActive={activeModule === "billing"}
                onClick={() => {
                  setActiveModule("billing");
                  setIsMobileMenuOpen(false);
                }}
              />
            </ul>
          </nav>

          <div className={styles.footer}>
            <div className={styles.logoContainer}>
              <img src="/revise-tax-logo.svg" alt="Revise Tax" className={styles.logo} />
            </div>
            <p className={styles.copyright}>© 2024, All rights reserved.</p>
          </div>
        </div>

        {/* Main Content */}
        <main>
          {children}
        </main>
      </div>
    </>
  )
}

interface SidebarItemProps {
  icon: React.ReactNode
  label: string
  isActive: boolean
  onClick: () => void
}

function SidebarItem({ icon, label, isActive, onClick }: SidebarItemProps) {
  return (
    <li>
      <button onClick={onClick} className={`${styles.navItem} ${isActive ? styles.active : ""}`}>
        <span className={styles.navIcon}>{icon}</span>
        <span className={styles.navLabel}>{label}</span>
      </button>
    </li>
  )
}