"use client"

import { useState, useEffect } from "react"
import type React from "react"
import styles from "./sidebar.module.css"
import { createClient } from "@/utils/supabase/client"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"

interface Chat {
  id: string
  name: string
  type: string
  isActive: boolean
}

interface SidebarProps {
  activeModule: string
  setActiveModule: (module: string) => void
  children?: React.ReactNode
  chats?: Chat[]
  onChatSelect?: (chatId: string) => void
  selectedChatId?: string | null
}

export default function Sidebar({ activeModule, setActiveModule, children, chats = [], onChatSelect, selectedChatId }: SidebarProps) {
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [editFormData, setEditFormData] = useState({ name: '', email: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        setUser(user);
        
        // Also fetch user profile from database
        if (user) {
          const response = await fetch('/api/user-profile');
          if (response.ok) {
            const data = await response.json();
            setUserProfile(data.user);
            setEditFormData({ name: data.user?.name || '', email: data.user?.email || '' });
          }
        }
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
    setIsOverlayOpen(false);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditFormData({ name: userProfile?.name || '', email: userProfile?.email || '' });
    setSelectedImage(null);
    setImagePreview(null);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleFileSelect = (file: File) => {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file type",
        description: "Please select an image file",
        variant: "destructive"
      });
      return;
    }
    
    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "File size must be less than 2MB",
        variant: "destructive"
      });
      return;
    }

    setSelectedImage(file);
    
    // Create preview URL
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleImageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const uploadImage = async (file: File): Promise<string | null> => {
    try {
      const formData = new FormData();
      formData.append('profilePhoto', file); // Changed from profileImage to profilePhoto for new endpoint

      const response = await fetch('/api/profile-photo', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        return data.profileImagePath;
      } else {
        console.error('Failed to upload image');
        return null;
      }
    } catch (error) {
      console.error('Error uploading image:', error);
      return null;
    }
  };

  const fetchUserProfile = async () => {
    try {
      const response = await fetch('/api/user-profile');
      if (response.ok) {
        const data = await response.json();
        setUserProfile(data.user);
        setEditFormData({ name: data.user?.name || '', email: data.user?.email || '' });
        
        // Check if we need to sync social profile picture
        // Note: This is now automatically handled by /api/profile-photo?autoSync=true in the image src
        await checkAndSyncSocialProfilePic();
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
    }
  };

  const checkAndSyncSocialProfilePic = async () => {
    // This function is now simplified since /api/profile-photo?autoSync=true 
    // handles auto-sync automatically when the image is requested.
    // We can still manually check sync status if needed.
    try {
      const checkResponse = await fetch('/api/profile-photo?action=sync-check');
      if (checkResponse.ok) {
        const checkData = await checkResponse.json();
        
        if (checkData.needsSync) {
          console.log(`User can sync ${checkData.provider} profile picture if needed`);
          // Auto-sync will happen automatically when image is displayed with autoSync=true
        }
      }
    } catch (error) {
      console.error('Error checking sync status:', error);
    }
  };

  const handleSaveProfile = async () => {
    if (!editFormData.name.trim()) {
      toast({
        title: "Name required",
        description: "Please enter your name",
        variant: "destructive"
      });
      return;
    }

    setIsSaving(true);
    try {
      let profileImageUpdated = false;
      
      // First, upload image if selected using the new profile-photo endpoint
      if (selectedImage) {
        const imageUploadResult = await uploadImage(selectedImage);
        if (imageUploadResult) {
          profileImageUpdated = true;
          console.log('Profile image uploaded successfully:', imageUploadResult);
        } else {
          toast({
            title: "Image upload failed",
            description: "Failed to upload profile image, but name/email will still be updated",
            variant: "destructive"
          });
        }
      }

      // Then update name/email using user-profile endpoint (without image)
      const formData = new FormData();
      formData.append('name', editFormData.name.trim());
      formData.append('email', editFormData.email.trim());

      const response = await fetch('/api/user-profile', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        
        // Close all profile-related modals
        setIsModalOpen(false);
        setIsOverlayOpen(false);
        
        // Clear image selection states
        setSelectedImage(null);
        setImagePreview(null);
        
        // Fetch fresh user data
        await fetchUserProfile();

        // Force refresh of profile image if it was updated
        if (profileImageUpdated) {
          // Add a small delay to ensure S3 upload is complete
          setTimeout(() => {
            // Force reload of profile images by updating the src with cache-busting timestamp
            const avatarImages = document.querySelectorAll('.avatarImage, .profilePicture');
            avatarImages.forEach((img: any) => {
              if (img.src.includes('/api/profile-photo')) {
                const timestamp = Date.now();
                const url = new URL(img.src, window.location.origin);
                url.searchParams.set('t', timestamp.toString());
                img.src = url.toString();
              }
            });
          }, 1000);
        }

        // Show success message from API
        const successMessage = profileImageUpdated 
          ? "Profile and image updated successfully" 
          : (data.message || "Profile updated successfully");
        
        toast({
          title: "Profile Updated",
          description: successMessage,
          variant: "default"
        });
      } else {
        const error = await response.json();
        toast({
          title: "Update failed",
          description: error.error || "Failed to update profile",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      toast({
        title: "Error",
        description: "Failed to update profile",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push('/auth/signin');
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

  const handleChatTabClick = () => {
    setIsDropdownOpen(!isDropdownOpen);
    if (!isDropdownOpen) {
      setActiveModule("chat");
      if (onChatSelect) {
        onChatSelect("");
      }
    }
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
              {/* Profile image ALWAYS served from S3 storage - NEVER from Supabase social links */}
              <img 
                src="/api/profile-photo?autoSync=true" 
                alt={userProfile?.name || "User avatar"}
                className={`${styles.avatarImage} avatarImage`}
                onError={(e) => {
                  // Fallback to default avatar if S3 profile photo fails to load
                  console.log('S3 profile photo failed to load, using default avatar');
                  (e.target as HTMLImageElement).src = "/Alborz.svg";
                }}
              />
            </div>
            <div className={styles.userInfo}>
              {isLoading ? (
                <div className={styles.loadingSpinner} />
              ) : (
                <p className={styles.userName}>
                  {userProfile?.name || user?.email?.split('@')[0] || 'User'}
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

          {/* Edit Profile Modal */}
          {isModalOpen && (
            <div className={styles.modalBackdrop} onClick={handleCloseModal}>
              <div className={styles.modal} onClick={e => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                  <h2>Edit Profile</h2>
                  <p>Modify your profile based on the current status</p>
                  <button className={styles.closeButton} onClick={handleCloseModal}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
                
                <div className={styles.modalContent}>
                  {/* Profile Picture Upload */}
                  <div 
                    className={`${styles.profilePictureSection} ${isDragging ? styles.dragging : ''}`}
                    onClick={() => document.getElementById('profile-image-input')?.click()}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  >
                    <input
                      id="profile-image-input"
                      type="file"
                      accept="image/*"
                      onChange={handleImageInputChange}
                      style={{ display: 'none' }}
                    />
                    <div className={styles.profilePictureContainer}>
                      <div className={styles.profilePictureWrapper}>
                        <img 
                          src={imagePreview || (userProfile?.profileImage ? "/api/profile-photo" : "/Avatar.svg")} 
                          alt="Profile" 
                          className={`${styles.profilePicture} profilePicture`}
                          onError={(e) => {
                            // Fallback to default avatar if S3 profile photo fails to load
                            (e.target as HTMLImageElement).src = "/Avatar.svg";
                          }}
                        />
                        <div className={styles.uploadIcon}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 16V8M8 12L12 8L16 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                      </div>
                    </div>
                    <div className={styles.uploadText}>
                      <span className={styles.clickToUpload}>Click to upload</span>
                      <span className={styles.dragDrop}>or drag and drop</span>
                      <span className={styles.fileFormats}>SVG, PNG, JPG or GIF (max. 2MB)</span>
                    </div>
                  </div>

                  {/* Form Fields */}
                  <div className={styles.formFields}>
                    <div className={styles.formGroup}>
                      <label className={styles.label}>Full Name</label>
                      <input
                        type="text"
                        className={styles.input}
                        value={editFormData.name}
                        onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                        placeholder="Enter your full name"
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.label}>Phone Number</label>
                      <input
                        type="text"
                        className={`${styles.input} ${styles.disabledInput}`}
                        value={`+91    ${userProfile?.phoneNumber || ''}`}
                        disabled
                      />
                      <span className={styles.fieldNote}>Changing phone number is not allowed at this time</span>
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.label}>Email</label>
                      <input
                        type="email"
                        className={`${styles.input} ${styles.disabledInput}`}
               
                        value={editFormData.email}
                        disabled
                      />
                      <span className={styles.fieldNote}>Changing email is not allowed at this time</span>
                    </div>
                  </div>

                  {/* Modal Actions */}
                  <div className={styles.modalActions}>
                    <button 
                      className={styles.cancelButton} 
                      onClick={handleCloseModal}
                      disabled={isSaving}
                    >
                      Cancel
                    </button>
                    <button 
                      className={styles.saveButton} 
                      onClick={handleSaveProfile}
                      disabled={isSaving}
                    >
                      {isSaving ? 'Saving...' : 'Save Profile'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <nav className={styles.nav}>
            <ul className={styles.navList}>
              <li>
                <SidebarItem
                  icon={<img src="/chat-icon.svg" alt="Chat" width={16.75} height={16.67} />}
                  label="Chat"
                  isActive={activeModule === "chat" && !selectedChatId}
                  onClick={handleChatTabClick}
                  hasDropdown={true}
                  isOpen={isDropdownOpen}
                  className="chatParent"
                />
                
                {/* Show chat list only when dropdown is open and no chat is selected */}
                {isDropdownOpen && !selectedChatId && (
                  <ul className={styles.chatDropdown}>
                    {chats.map((chat) => (
                      <li key={chat.id}>
                        <button 
                          onClick={() => {
                            if (onChatSelect) {
                              onChatSelect(chat.id);
                              setIsDropdownOpen(false);
                            }
                          }}
                          className={`${styles.chatItem} ${chat.id === selectedChatId ? styles.active : ""}`}
                        >
                          <span className={styles.navLabel}>{chat.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                
                {/* Show selected chat when one is selected */}
                {selectedChatId && (
                  <div className={styles.selectedChat}>
                    {chats.map((chat) => (
                      chat.id === selectedChatId && (
                        <button 
                          key={chat.id}
                          className={`${styles.chatItem} ${styles.active}`}
                          onClick={() => {
                            if (onChatSelect) {
                              onChatSelect("");
                              setIsDropdownOpen(true);
                            }
                          }}
                        >
                          <span className={styles.navLabel}>{chat.name}</span>
                        </button>
                      )
                    ))}
                  </div>
                )}
              </li>

              <SidebarItem
                icon={<img src="/document-icon.svg" alt="Documents" width={16} height={16} />}
                label="Documents"
                isActive={activeModule === "documents"}
                onClick={() => {
                  setActiveModule("documents");
                  setIsMobileMenuOpen(false);
                }}
              />
              
              <SidebarItem
                icon={<img src="/plans-icon.svg" alt="Plans" width={16} height={16} />}
                label="Plans"
                isActive={activeModule === "plans"}
                onClick={() => {
                  setActiveModule("plans");
                  setIsMobileMenuOpen(false);
                }}
              />
              
              <SidebarItem
                icon={<img src="/billing-icon.svg" alt="Billing" width={16} height={16} />}
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
            <p className={styles.copyright}>© 2025, All rights reserved.</p>
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

function SidebarItem({ icon, label, isActive, onClick, hasDropdown = false, isOpen = false, className = '' }: SidebarItemProps & { hasDropdown?: boolean; isOpen?: boolean; className?: string }) {
  return (
    <button
      className={`${styles.navItem} ${isActive ? styles.active : ""} ${className ? styles[className] : ''}`}
      onClick={onClick}
    >
      <span className={styles.navIcon}>{icon}</span>
      <span className={styles.navLabel}>{label}</span>
      {hasDropdown && (
        <img 
          src="/chevron-down-icon.svg" 
          alt="Expand" 
          className={`${styles.dropdownIcon} ${isOpen ? styles.open : ''}`}
          width={12} 
          height={12} 
        />
      )}
    </button>
  )
}