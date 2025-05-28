'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import AuthLayout from '../../../components/AuthLayout';
import OTPInput from '@/components/OTPInput';
import { createClient } from '@/utils/supabase/client';
import { useToast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import styles from '../styles.module.css';

function DetailsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  
  // Get params from URL
  const phoneParam = searchParams.get('phone') || '';
  const socialEmail = searchParams.get('email') || '';
  const socialName = searchParams.get('name') || '';
  const socialProvider = searchParams.get('provider') || '';
  const socialProviderId = searchParams.get('providerId') || '';
  
  const [phoneNumber, setPhoneNumber] = useState(phoneParam);
  const [fullName, setFullName] = useState(socialName);
  const [email, setEmail] = useState(socialEmail);
  const [loading, setLoading] = useState(false);
  const [showOTP, setShowOTP] = useState(false);
  const [otp, setOTP] = useState('');
  const [resendOTPTimer, setResendOTPTimer] = useState(0);
  const [resendOTPDisabled, setResendOTPDisabled] = useState(false);
  const [isSocialFlow, setIsSocialFlow] = useState(false);

  useEffect(() => {
    // Check if this is a social flow
    if (socialProvider) {
      setIsSocialFlow(true);
      toast({
        title: "Complete Your Registration",
        description: "Please provide your phone number to complete your account setup.",
        duration: 6000,
      });
    } else {
      // If no phone number is provided and not social flow, redirect
      if (!phoneParam) {
        router.push('/auth');
        return;
      }
    }
  }, [phoneParam, socialProvider, router, toast]);

  const formatPhoneNumber = (value: string) => {
    return value.replace(/\D/g, '');
  };

  const validatePhoneNumber = (phone: string) => {
    const digits = phone.replace(/\D/g, '');
    return digits.length === 10;
  };

  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleSendOTP = async () => {
    try {
      if (!validatePhoneNumber(phoneNumber)) {
        toast({
          title: "Invalid Phone Number",
          description: "Please enter a valid 10-digit phone number to proceed.",
          variant: "destructive",
          duration: 4000,
        });
        return;
      }

      setLoading(true);
      const formattedPhone = phoneNumber.startsWith('+91') ? phoneNumber : '+91' + phoneNumber.replace(/\s+/g, '');
      
      // Check if user already exists by phone or email
      const response = await fetch('/api/check-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          phoneNumber: formattedPhone,
          email: email 
        }),
      });
      
      const userExists = await response.json();
      if (userExists) {
        toast({
          title: "Account Already Exists",
          description: "An account with this phone number or email already exists. Please sign in instead.",
          variant: "destructive",
          duration: 4000,
        });
        return;
      }

      const supabase = createClient();

      if (isSocialFlow) {
        // For social flow, update phone number
        const { error: updateError } = await supabase.auth.updateUser({ phone: formattedPhone });
        if (updateError) throw updateError;
      } else {
        // For regular flow, send OTP
        const { error } = await supabase.auth.signInWithOtp({
          phone: formattedPhone,
        });
        if (error) throw error;
      }

      setShowOTP(true);
      setResendOTPDisabled(true);
      setResendOTPTimer(30);
      
      toast({
        title: "OTP Sent",
        description: "A verification code has been sent to your phone number.",
        duration: 4000,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
        duration: 4000,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    try {
      setLoading(true);
      const formattedPhone = phoneNumber.startsWith('+91') ? phoneNumber : '+91' + phoneNumber.replace(/\s+/g, '');
      
      const supabase = createClient();
      
      if (isSocialFlow) {
        // For social flow, verify phone change
        const { error: verifyError } = await supabase.auth.verifyOtp({
          phone: formattedPhone,
          token: otp,
          type: 'phone_change'
        });
        if (verifyError) throw verifyError;
      } else {
        // For regular flow, verify SMS
        const { error: verifyError } = await supabase.auth.verifyOtp({
          phone: formattedPhone,
          token: otp,
          type: 'sms'
        });
        if (verifyError) throw verifyError;
      }

      // Update user metadata with name and email
      const { error: updateError } = await supabase.auth.updateUser({
        data: { 
          full_name: fullName,
          email: email 
        }
      });

      if (updateError) {
        console.error("Error updating user metadata:", updateError);
        throw updateError;
      }

      // Get the current user
      const { data: { user: supabaseUser } } = await supabase.auth.getUser();
      
      if (!supabaseUser) {
        throw new Error('User not found after OTP verification');
      }

      // Create user in our database
      const createResponse = await fetch('/api/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          supabaseUserId: supabaseUser.id,
          name: fullName,
          email: email,
          phoneNumber: formattedPhone,
          provider: socialProvider || undefined,
          providerId: socialProviderId || undefined
        }),
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.json();
        throw new Error(errorData.message || 'Failed to create account');
      }

      toast({
        title: "Success",
        description: "Your account has been created successfully!",
        duration: 2000,
      });

      // Redirect to dashboard
      setTimeout(() => {
        router.push('/dashboard');
      }, 1000);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to verify OTP. Please try again.';
      toast({
        title: "Verification Failed",
        description: errorMessage,
        variant: "destructive",
        duration: 4000,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    try {
      setLoading(true);
      setResendOTPDisabled(true);
      setResendOTPTimer(30);
      setOTP('');
      const formattedPhone = phoneNumber.startsWith('+91') ? phoneNumber : '+91' + phoneNumber.replace(/\s+/g, '');
      
      const supabase = createClient();
      
      if (isSocialFlow) {
        const { error: updateError } = await supabase.auth.updateUser({ phone: formattedPhone });
        if (updateError) throw updateError;
      } else {
        const { error } = await supabase.auth.signInWithOtp({
          phone: formattedPhone,
        });
        if (error) throw error;
      }
      
      toast({
        title: "OTP Resent",
        description: "A new verification code has been sent to your phone number.",
        duration: 4000,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      toast({
        title: "Failed to Resend OTP",
        description: errorMessage,
        variant: "destructive",
        duration: 4000,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAccount = async () => {
    try {
      // Validate inputs
      if (!fullName.trim()) {
        toast({
          title: "Name Required",
          description: "Please enter your full name to continue.",
          variant: "destructive",
          duration: 4000,
        });
        return;
      }

      if (!email.trim() || !validateEmail(email)) {
        toast({
          title: "Valid Email Required",
          description: "Please enter a valid email address to continue.",
          variant: "destructive",
          duration: 4000,
        });
        return;
      }
      
      // If this is a phone-verified user (not social flow), create account directly
      if (phoneParam && !isSocialFlow) {
        setLoading(true);
        const formattedPhone = phoneParam.startsWith('+91') ? phoneParam : '+91' + phoneParam.replace(/\s+/g, '');
        
        const supabase = createClient();
        
        // Get the current user (should be authenticated via phone)
        const { data: { user: supabaseUser } } = await supabase.auth.getUser();
        
        if (!supabaseUser) {
          toast({
            title: "Authentication Error",
            description: "Please go back and verify your phone number first.",
            variant: "destructive",
            duration: 4000,
          });
          router.push('/auth');
          return;
        }

        // Update user metadata with name and email
        const { error: updateError } = await supabase.auth.updateUser({
          data: { 
            full_name: fullName,
            email: email 
          }
        });

        if (updateError) {
          console.error("Error updating user metadata:", updateError);
          throw updateError;
        }

        // Create user in our database
        const createResponse = await fetch('/api/create-user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            supabaseUserId: supabaseUser.id,
            name: fullName,
            email: email,
            phoneNumber: formattedPhone,
            provider: undefined,
            providerId: undefined
          }),
        });

        if (!createResponse.ok) {
          const errorData = await createResponse.json();
          throw new Error(errorData.message || 'Failed to create account');
        }

        toast({
          title: "Success",
          description: "Your account has been created successfully!",
          duration: 2000,
        });

        // Redirect to dashboard
        setTimeout(() => {
          router.push('/dashboard');
        }, 1000);
        
      } else {
        // For social flow, send OTP for phone verification
        await handleSendOTP();
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create account. Please try again.';
      toast({
        title: "Account Creation Failed",
        description: errorMessage,
        variant: "destructive",
        duration: 4000,
      });
    } finally {
      setLoading(false);
    }
  };

  // Timer effect for resend OTP
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (resendOTPDisabled && resendOTPTimer > 0) {
      timer = setInterval(() => {
        setResendOTPTimer((prev) => {
          if (prev <= 1) {
            setResendOTPDisabled(false);
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [resendOTPDisabled, resendOTPTimer]);

  return (
    <AuthLayout>
      <div className={styles.detailsCard}>
        {/* Logo and Welcome Section */}
        {!showOTP && (
          <div className={styles.detailsWelcomeSection}>
            <Image
              src="/logo-dark-login.svg"
              alt="ReviseTax"
              width={92}
              height={24}
              priority
              className={styles.authLogo}
            />
            <h1 className={styles.welcomeTitle}>
              {isSocialFlow ? 'Complete Your Registration' : 'Complete Your Profile'}
            </h1>
            <p className={styles.welcomeDescription}>
              {isSocialFlow 
                ? "Please provide your phone number to complete your account setup."
                : "We need a few more details to set up your ReviseTax account."
              }
            </p>
          </div>
        )}

        {/* Form Section */}
        <div className={styles.formSection}>
          {!showOTP ? (
            <>
              {/* Full Name Input */}
              <div className={styles.detailsInputGroup}>
                <label htmlFor="fullName" className={styles.inputLabel}>
                  Full Name
                </label>
                <input
                  id="fullName"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className={styles.detailsFormInput}
                  placeholder="Enter your full name"
                  maxLength={100}
                  disabled={!!(socialName && isSocialFlow)} // Fixed TypeScript error
                />
              </div>

              {/* Email Input */}
              <div className={styles.detailsInputGroup}>
                <label htmlFor="email" className={styles.inputLabel}>
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={styles.detailsFormInput}
                  placeholder="Enter your email address"
                  maxLength={100}
                  disabled={!!(socialEmail && isSocialFlow)} // Fixed TypeScript error
                />
              </div>

              {/* Phone Input */}
              <div className={styles.detailsInputGroup}>
                <label htmlFor="phone" className={styles.inputLabel}>
                  Phone Number
                  {phoneParam && !isSocialFlow && <span className={styles.verifiedBadge}>Verified</span>}
                </label>
                {phoneParam && !isSocialFlow ? (
                  <div className={styles.detailsPhoneVerified}>
                    +91 {phoneParam}
                  </div>
                ) : (
                  <div className={styles.phoneInputContainer}>
                    <span className={styles.phonePrefix}>
                      +91
                    </span>
                    <input
                      id="phone"
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(formatPhoneNumber(e.target.value))}
                      className={styles.phoneInput}
                      placeholder="Enter your 10-digit number"
                      maxLength={10}
                    />
                  </div>
                )}
              </div>

              {/* Create Account / Send OTP Button */}
              <button
                onClick={handleCreateAccount}
                disabled={loading}
                className={styles.detailsButton}
              >
                {loading ? (
                  <span className={styles.detailsButtonContent}>
                    <Image src="/Loading3Quarters%20(1).svg" alt="Loading" width={20} height={20} className={styles.detailsLoadingSpinner} />
                    Processing...
                  </span>
                ) : (phoneParam && !isSocialFlow ? 'Create Account' : 'Send OTP')}
              </button>

              {/* Back Link */}
              <div className={styles.detailsTextCenter}>
                <button
                  onClick={() => router.back()}
                  className={styles.detailsBackButton}
                  disabled={loading}
                >
                  Back
                </button>
              </div>
            </>
          ) : (
            <>
              <OTPInput
                otpValue={otp}
                onChange={setOTP}
                phoneNumber={phoneNumber}
                onVerify={handleVerifyOTP}
                onCancel={() => { 
                  setShowOTP(false); 
                  setOTP(''); 
                }}
                onResendOTP={handleResendOTP}
                isVerifying={loading}
                resendOTPTimer={resendOTPTimer}
                resendOTPDisabled={resendOTPDisabled}
              />
            </>
          )}
        </div>
      </div>
      <Toaster />
    </AuthLayout>
  );
}

export default function Details() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <DetailsContent />
    </Suspense>
  );
} 