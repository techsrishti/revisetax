'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import AuthLayout from '../../components/AuthLayout';
import OTPInput from '@/components/OTPInput';
import { createClient } from '@/utils/supabase/client';
import { useToast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import styles from './styles.module.css';

function AuthContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  
  // Get social login params if they exist
  const socialEmail = searchParams.get('email') || '';
  const socialName = searchParams.get('name') || '';
  const socialProvider = searchParams.get('provider') || '';
  const socialProviderId = searchParams.get('providerId') || '';
  
  const [phoneNumber, setPhoneNumber] = useState(searchParams.get('phone') || '');
  const [loading, setLoading] = useState(false);
  const [showOTP, setShowOTP] = useState(false);
  const [otp, setOTP] = useState('');
  const [resendOTPTimer, setResendOTPTimer] = useState(0);
  const [resendOTPDisabled, setResendOTPDisabled] = useState(false);
  const [isSocialFlow, setIsSocialFlow] = useState(false);
  const [userExists, setUserExists] = useState<boolean | null>(null);
  const [authStep, setAuthStep] = useState<'phone' | 'otp' | 'details'>('phone');

  useEffect(() => {
    // Show error from URL params if exists
    const errorParam = searchParams.get('error');
    if (errorParam) {
      toast({
        title: "Error",
        description: errorParam,
        variant: "destructive",
        duration: 4000,
      });
    }

    // Check if this is a social login flow
    if (socialProvider) {
      setIsSocialFlow(true);
      // If we have social login but no phone, ask for phone
      if (!phoneNumber) {
        toast({
          title: "Phone Verification Required",
          description: "Please verify your phone number to complete your registration.",
          duration: 6000,
        });
      }
    }
  }, [searchParams, toast, socialProvider, phoneNumber]);

  const formatPhoneNumber = (value: string) => {
    return value.replace(/\D/g, '');
  };

  const validatePhoneNumber = (phone: string) => {
    const digits = phone.replace(/\D/g, '');
    return digits.length === 10;
  };

  const checkUserExists = async (formattedPhone: string) => {
    try {
      const response = await fetch('/api/check-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          phoneNumber: formattedPhone,
          email: socialEmail || undefined 
        }),
      });
      return await response.json();
    } catch (error) {
      console.error('Error checking user:', error);
      return false;
    }
  };

  const handlePhoneSubmit = async () => {
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
      const formattedPhone = '+91' + phoneNumber.replace(/\s+/g, '');
      
      // Check if user exists
      const existsInDB = await checkUserExists(formattedPhone);
      setUserExists(existsInDB);

      const supabase = createClient();

      if (isSocialFlow) {
        // For social flow, update phone number
        const { error: updateError } = await supabase.auth.updateUser({ phone: formattedPhone });
        if (updateError) throw updateError;
      } else {
        // For phone flow, send OTP
        const { error } = await supabase.auth.signInWithOtp({
          phone: formattedPhone,
        });
        if (error) throw error;
      }

      setShowOTP(true);
      setAuthStep('otp');
      
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
      const formattedPhone = '+91' + phoneNumber.replace(/\s+/g, '');
      
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
        // For regular phone flow, verify SMS
        const { error: verifyError } = await supabase.auth.verifyOtp({
          phone: formattedPhone,
          token: otp,
          type: 'sms'
        });
        if (verifyError) throw verifyError;
      }

      // After successful OTP verification, check what to do next
      if (userExists) {
        // User exists - redirect to dashboard
        if (!isSocialFlow) {
          router.push('/dashboard');
          return;
        } else {
          // Update existing user with social info and redirect to dashboard
          const { data: { user: supabaseUser } } = await supabase.auth.getUser();
          
          await fetch('/api/create-user', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              supabaseUserId: supabaseUser?.id || '',
              name: socialName,
              email: socialEmail,
              phoneNumber: formattedPhone,
              provider: socialProvider,
              providerId: socialProviderId
            }),
          });
          
          router.push('/dashboard');
          return;
        }
      } else {
        // User doesn't exist - redirect to details collection
        const params = new URLSearchParams({
          phone: phoneNumber,
          ...(socialEmail && { email: socialEmail }),
          ...(socialName && { name: socialName }),
          ...(socialProvider && { provider: socialProvider }),
          ...(socialProviderId && { providerId: socialProviderId })
        });
        
        router.push(`/auth/details?${params.toString()}`);
      }
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

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent'
          }
        }
      });
      if (error) throw error;
      if (!data.url) throw new Error('No URL returned from OAuth provider');
      window.location.href = data.url;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      toast({
        title: "Google Sign In Failed",
        description: errorMessage,
        variant: "destructive",
        duration: 4000,
      });
      setLoading(false);
    }
  };

  const handleLinkedInSignIn = async () => {
    try {
      setLoading(true);
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'linkedin_oidc',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent'
          }
        }
      });
      if (error) throw error;
      if (!data.url) throw new Error('No URL returned from OAuth provider');
      window.location.href = data.url;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      toast({
        title: "LinkedIn Sign In Failed",
        description: errorMessage,
        variant: "destructive",
        duration: 4000,
      });
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    try {
      setLoading(true);
      setResendOTPDisabled(true);
      setResendOTPTimer(30);
      setOTP('');
      const formattedPhone = '+91' + phoneNumber.replace(/\s+/g, '');
      
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
      <div className={styles.authCard}>
        {/* Logo and Welcome Section */}
        {!showOTP && (
          <div className={styles.welcomeSection}>
            <Image
              src="/logo-dark-login.svg"
              alt="ReviseTax"
              width={92}
              height={24}
              priority
              className={styles.authLogo}
            />
            <h1 className={styles.welcomeTitle}>
              Welcome to <span className={styles.welcomeTitleHighlight}>ReviseTax</span>
            </h1>
            <p className={styles.welcomeDescription}>
              {isSocialFlow 
                ? "Please verify your phone number to complete your account setup."
                : "Your number is used to log in to your account or create one if it doesn't exist."
              }
            </p>
          </div>
        )}

        {/* Form Section */}
        <div className={styles.formSection}>
          {!showOTP ? (
            <>
              {/* Phone Input */}
              <div className={styles.inputGroup}>
                <label htmlFor="phone" className={styles.inputLabel}>
                  Phone Number
                </label>
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
              </div>

              {/* Continue Button */}
              <button
                onClick={handlePhoneSubmit}
                disabled={loading}
                className={styles.continueButton}
              >
                {loading ? (
                  <span className={styles.buttonContent}>
                    <Image src="/Loading3Quarters%20(1).svg" alt="Loading" width={20} height={20} className={styles.loadingSpinner} />
                    Processing...
                  </span>
                ) : 'Send OTP'}
              </button>

              {/* Divider - Only show if not in social flow */}
              {!isSocialFlow && (
                <>
                  <div className={styles.dividerContainer}>
                    <div className={styles.dividerLine}>
                      <div className={styles.dividerBorder}></div>
                    </div>
                    <div className={styles.dividerTextContainer}>
                      <span className={styles.dividerText}>Or continue with</span>
                    </div>
                  </div>

                  {/* Social Buttons */}
                  <div className={styles.socialButtonsContainer}>
                    <button
                      onClick={handleGoogleSignIn}
                      disabled={loading}
                      className={styles.socialButton}
                    >
                      <Image src="/google.svg" alt="Google" width={20} height={20} />
                      <span>Continue with Google</span>
                    </button>
                    <button
                      onClick={handleLinkedInSignIn}
                      disabled={loading}
                      className={styles.socialButton}
                    >
                      <Image src="/linkedin.svg" alt="LinkedIn" width={20} height={20} />
                      <span>Continue with LinkedIn</span>
                    </button>
                  </div>
                </>
              )}
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
                  setAuthStep('phone');
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

export default function Auth() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <AuthContent />
    </Suspense>
  );
} 