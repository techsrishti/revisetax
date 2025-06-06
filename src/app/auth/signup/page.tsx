'use client';

import { useState, useEffect, Suspense } from 'react';
import { redirect, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import AuthLayout from '@/components/AuthLayout';
import OTPInput from '@/components/OTPInput';
import { createClient } from '@/utils/supabase/client';
import { useToast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import styles from '@/app/auth/styles.module.css';

 function SignUpContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const supabase = createClient();
  
  // Get social login params if they exist
  const socialEmail = searchParams.get('email') || '';
  const socialName = searchParams.get('name') || '';
  const socialProvider = searchParams.get('provider') || '';
  const socialProviderId = searchParams.get('providerId') || '';
  
  const [phoneNumber, setPhoneNumber] = useState(searchParams.get('phone') || '');
  const [fullName, setFullName] = useState(socialName);
  const [email, setEmail] = useState(socialEmail);
  const [loading, setLoading] = useState(false);
  const [showOTP, setShowOTP] = useState(false);
  const [otp, setOTP] = useState('');
  const [error, setError] = useState('');
  const [isSocialLogin, setIsSocialLogin] = useState(false);
  const [resendOTPTimer, setResendOTPTimer] = useState(0);
  const [resendOTPDisabled, setResendOTPDisabled] = useState(false);


  
  useEffect(() => {

    // Show notification if user came from social login

    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      console.log("user", user);
      
      if (user) {
        console.log("User is already logged in. Here for phone verification", user);
        setIsSocialLogin(true);
      } else {
        console.log("User is not logged in");
        setIsSocialLogin(false);
      }
    };

    checkUser();

    if (socialProvider) {
      toast({
        title: "Phone Verification Required",
        description: "Please verify your phone number to complete your registration with ReviseTax.",
        duration: 6000,
      });
    }

  }, [socialProvider, toast]);

  const formatPhoneNumber = (value: string) => {
    return value.replace(/\D/g, '');
  };

  const validatePhoneNumber = (phone: string) => {
    const digits = phone.replace(/\D/g, '');
    return digits.length === 10;
  };

  const handleCreateAccount = async () => {
    try {
      if (!validatePhoneNumber(phoneNumber)) {
        toast({
          title: "Invalid Phone Number",
          description: "Please enter a valid 10-digit phone number to proceed with registration.",
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

      if (isSocialLogin) {
        console.log("Updating phone number for existing user")
        
        const { error: updateError } = await supabase.auth.updateUser({ phone: formattedPhone });
        if (updateError) { 
          console.log(updateError); 
          throw updateError;
        }

      }

      else {
        console.log("normal phone and email singup")

        const { error: otpError } = await supabase.auth.signInWithOtp({
          phone: formattedPhone,
          options: {
            data: {
              full_name: fullName || undefined
            }
          }
        });

        if (otpError) {
          console.log("otpError", otpError)
          throw otpError;
        }
        
        console.log("email link generated")
      }

      setShowOTP(true);
      
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
      
      if (isSocialLogin){ 
        //User already signedup with social login.
        const { error: verifyError } = await supabase.auth.verifyOtp({
          phone: formattedPhone,
          token: otp,
          type: 'phone_change' //Have to use phone_change since the opt is sent using `updateUser`
        });

        if (verifyError) {
          console.log("verifyError", verifyError)
          throw verifyError;
        }

        console.log("phone updated")

      } else {
        //User is signing up for the first time.
        const { error: verifyError } = await supabase.auth.verifyOtp({
          phone: formattedPhone,
          token: otp,
          type: 'sms'
        });

        if (verifyError) {
          console.log("verifyError", verifyError)
          throw verifyError;
        }

        // Update user metadata with full name and email immediately after OTP verification
        const { error: updateError } = await supabase.auth.updateUser({
           data: { full_name: fullName }
        });

        if (updateError) {
          console.error("Error updating user metadata:", updateError);
          throw updateError;
        }

        console.log("phone, email, and name updated")
      }

      // Create user with all available information
      const { data: { user: supabaseUser } } = await supabase.auth.getUser();
      console.log("supabaseUser", supabaseUser)

      const createResponse = await fetch('/api/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          supabaseUserId: supabaseUser?.id || '',
          name: fullName,
          email,
          phoneNumber: formattedPhone,
          provider: socialProvider,
          providerId: socialProviderId
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

      router.push('/dashboard');
      return;

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
      const formattedPhone = '+91' + phoneNumber.replace(/\s+/g, '');
      console.log('Attempting to resend OTP to:', formattedPhone);

      if (isSocialLogin) {
        // For social login, we need to update phone number again
        const { error: updateError } = await supabase.auth.updateUser({ phone: formattedPhone });
        if (updateError) {
          console.error('Supabase update phone error:', updateError);
          throw updateError;
        }
      } else {
        // For regular signup, use signInWithOtp
        const { error: otpError } = await supabase.auth.signInWithOtp({
          phone: formattedPhone,
          options: {
            data: {
              full_name: fullName || undefined
            }
          }
        });
        if (otpError) {
          console.error('Supabase OTP error:', otpError);
          throw otpError;
        }
      }

      // Only start the timer and disable resend after successful OTP send
      setResendOTPDisabled(true);
      setResendOTPTimer(30);
      setOTP('');
      
      toast({
        title: "OTP Resent",
        description: "A new verification code has been sent to your phone number.",
        duration: 4000,
      });
    } catch (err) {
      console.error('Full error details:', err);
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      toast({
        title: "Failed to Resend OTP",
        description: errorMessage,
        variant: "destructive",
        duration: 4000,
      });
      // Reset timer and disabled state on error
      setResendOTPDisabled(false);
      setResendOTPTimer(0);
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
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [resendOTPDisabled, resendOTPTimer]);

  return (
    <AuthLayout>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '0.5rem',
        boxShadow: '0 10px 15px rgba(0,0,0,0.1)',
        overflow: 'hidden',
      }}>
        {/* Logo and Welcome Section */}
        {!showOTP && (
          <div style={{
            backgroundColor: '#F3F4F6',
            padding: '1.5rem 1.5rem 2rem',
          }}>
            <Image
              src="/logo-dark-login.svg"
              alt="ReviseTax"
              width={92}
              height={24}
              priority
              style={{ marginBottom: '1.5rem' }}
            />
            <h1 style={{
              color: '#111827',
              marginBottom: '0.5rem',
              fontFamily: 'Cabinet Grotesk Variable, sans-serif',
              fontWeight: 700,
              fontSize: '24px',
              lineHeight: '100%',
              letterSpacing: '0',
              fontVariantNumeric: 'lining-nums tabular-nums'
            }}>
              Create Account
            </h1>
            <p className={styles.description}>
              Seems like you don't have an account with us yet. We just need your name and email.
            </p>
          </div>
        )}

        {/* Form Section */}
        <div style={showOTP ? {} : { padding: '1.5rem' }}>
          {!showOTP ? (
            <>
              {/* Full Name Input */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label
                  htmlFor="fullName"
                  style={{
                    display: 'block',
                    color: '#111827',
                    fontSize: '1rem',
                    marginBottom: '0.5rem',
                    fontWeight: 500
                  }}
                >
                  Full Name
                </label>
                <input
                  id="fullName"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter your full name"
                  style={{
                    width: '100%',
                    height: '3rem',
                    padding: '0 1rem',
                    backgroundColor: '#F9FAFB',
                    border: '1px solid #D1D5DB',
                    borderRadius: '0.375rem',
                    color: '#111827',
                    fontSize: '1rem',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = '#FF4400'}
                  onBlur={e => e.currentTarget.style.borderColor = '#D1D5DB'}
                />
              </div>

              {/* Email Input */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label
                  htmlFor="email"
                  style={{
                    display: 'block',
                    color: '#111827',
                    fontSize: '1rem',
                    marginBottom: '0.5rem',
                    fontWeight: 500
                  }}
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  style={{
                    width: '100%',
                    height: '3rem',
                    padding: '0 1rem',
                    backgroundColor: '#F9FAFB',
                    border: '1px solid #D1D5DB',
                    borderRadius: '0.375rem',
                    color: '#111827',
                    fontSize: '1rem',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = '#FF4400'}
                  onBlur={e => e.currentTarget.style.borderColor = '#D1D5DB'}
                />
              </div>

              {/* Phone Input */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label
                  htmlFor="phone"
                  style={{
                    display: 'block',
                    color: '#111827',
                    fontSize: '1rem',
                    marginBottom: '0.5rem',
                    fontWeight: 500
                  }}
                >
                  Phone Number
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{
                    position: 'absolute',
                    left: '1rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#6B7280',
                    pointerEvents: 'none',
                    userSelect: 'none'
                  }}>
                    +91
                  </span>
                  <input
                    id="phone"
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(formatPhoneNumber(e.target.value))}
                    placeholder="Enter your 10-digit number"
                    maxLength={10}
                    style={{
                      width: '100%',
                      height: '3rem',
                      paddingLeft: '3rem',
                      paddingRight: '1rem',
                      backgroundColor: '#F9FAFB',
                      border: '1px solid #D1D5DB',
                      borderRadius: '0.375rem',
                      color: '#111827',
                      fontSize: '1rem',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                    onFocus={e => e.currentTarget.style.borderColor = '#FF4400'}
                    onBlur={e => e.currentTarget.style.borderColor = '#D1D5DB'}
                  />
                </div>
              </div>

              {/* Create Account Button */}
              <button
                onClick={handleCreateAccount}
                disabled={loading || !fullName || !email || !validatePhoneNumber(phoneNumber)}
                style={{
                  width: '100%',
                  height: '3rem',
                  backgroundColor: loading || !fullName || !email || !validatePhoneNumber(phoneNumber) ? '#FF440080' : '#FF4400',
                  color: 'white',
                  fontWeight: '600',
                  borderRadius: '0.375rem',
                  border: 'none',
                  cursor: loading || !fullName || !email || !validatePhoneNumber(phoneNumber) ? 'not-allowed' : 'pointer',
                  transition: 'background-color 0.2s ease',
                  marginBottom: '1.5rem'
                }}
                onMouseOver={e => {
                  if (!(loading || !fullName || !email || !validatePhoneNumber(phoneNumber))) {
                    (e.currentTarget as HTMLElement).style.backgroundColor = '#E63D00';
                  }
                }}
                onMouseOut={e => {
                  if (!(loading || !fullName || !email || !validatePhoneNumber(phoneNumber))) {
                    (e.currentTarget as HTMLElement).style.backgroundColor = '#FF4400';
                  }
                }}
              >
                {loading ? 'Processing...' : 'Create Account'}
              </button>

              {/* Sign In Link */}
              <div style={{ textAlign: 'center' }}>
                <p style={{ color: '#111827' }}>
                  Already have an account?{' '}
                  <Link href="/auth/signin" style={{ color: '#FF4400', textDecoration: 'none' }}
                    onMouseOver={e => (e.currentTarget.style.color = '#E63D00')}
                    onMouseOut={e => (e.currentTarget.style.color = '#FF4400')}
                  >
                    Sign in
                  </Link>
                </p>
              </div>
            </>
          ) : (
            <OTPInput
              otpValue={otp}
              onChange={setOTP}
              phoneNumber={phoneNumber}
              onVerify={handleVerifyOTP}
              onCancel={() => { setShowOTP(false); setOTP(''); }}
              onResendOTP={handleResendOTP}
              isVerifying={loading}
              resendOTPTimer={resendOTPTimer}
              resendOTPDisabled={resendOTPDisabled}
            />
          )}
        </div>
      </div>
      <Toaster />
    </AuthLayout>
  );
}

export default  function SignUp() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SignUpContent />
    </Suspense>
  );
}