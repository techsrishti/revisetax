"use client"

import { useState, useEffect } from "react"
import type React from "react"
import styles from "./sidebar.module.css"

interface SidebarProps {
  activeModule: string
  setActiveModule: (module: string) => void
}

export default function Sidebar({ activeModule, setActiveModule }: SidebarProps) {
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setIsMobileMenuOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleProfileClick = () => {
    setIsOverlayOpen(true);
  };
  
  const handleEditProfileClick = () => {
    setIsModalOpen(true);
    // This would typically open a modal with animation
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };
  
  return (
    <>
      {/* Mobile menu toggle button */}
      <button 
        className={styles.mobileMenuToggle}
        onClick={toggleMobileMenu}
        aria-label="Toggle menu"
      >
        <img src="/menu-icon.svg" alt="Menu" width={24} height={24} />
      </button>

      <div className={`${styles.sidebar} ${isMobileMenuOpen ? styles.open : ''}`}>
        <div 
          className={styles.userProfile} 
          onClick={handleProfileClick}
          style={{ cursor: 'pointer' }}
        >
          <div className={styles.avatar}>
            <img src="/Alborz.svg" alt="User" className={styles.avatarImage} />
          </div>
          <div className={styles.userInfo}>
            <p className={styles.userName}>Kiran Shah</p>
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
              <button className={styles.overlayItem} onClick={() => console.log("Logout clicked")}>
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
              onClick={() => setActiveModule("chat")}
            />
            <SidebarItem
              icon={<img src="/document-icon.svg" alt="Documents" width={16.75} height={16.67} />}
              label="Documents"
              isActive={activeModule === "documents"}
              onClick={() => setActiveModule("documents")}
            />
            <SidebarItem
              icon={<img src="/plans-icon.svg" alt="Plans" width={16.75} height={16.67} />}
              label="Plans"
              isActive={activeModule === "plans"}
              onClick={() => setActiveModule("plans")}
            />
            <SidebarItem
              icon={<img src="/billing-icon.svg" alt="Billing" width={16.75} height={16.67} />}
              label="Billing"
              isActive={activeModule === "billing"}
              onClick={() => setActiveModule("billing")}
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
