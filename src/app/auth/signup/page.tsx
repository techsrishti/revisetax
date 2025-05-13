'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import AuthLayout from '../../../components/AuthLayout';
import OTPInput from '../../../components/OTPInput';
import { supabase } from '@/utils/supabase/supabase';
import { useToast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import styles from '../styles.module.css';

function SignUpContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  
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
  const [otpValues, setOtpValues] = useState(['', '', '', '', '', '']);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    // Show notification if user came from social login
    if (socialProvider) {
      toast({
        title: "Phone Verification Required",
        description: "Please verify your phone number to complete your registration with ReviseTax.",
        duration: 6000,
      });
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
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

      // Always verify phone number with OTP, even for social logins
      const { error: otpError } = await supabase.auth.signInWithOtp({
        phone: formattedPhone,
      });

      if (otpError) throw otpError;
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
      
      const { error: verifyError } = await supabase.auth.verifyOtp({
        phone: formattedPhone,
        token: otp,
        type: 'sms'
      });

      if (verifyError) throw verifyError;

      try {
        // Create user with all available information
        const createResponse = await fetch('/api/create-user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
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

        // Redirect to dashboard on successful account creation
        router.push('/dashboard');
      } catch (createError) {
        throw new Error(createError instanceof Error ? createError.message : 'Failed to create account');
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

  const handleOtpChange = (index: number, value: string) => {
    if (isNaN(Number(value))) return;
    
    const newOtpValues = [...otpValues];
    newOtpValues[index] = value;
    setOtpValues(newOtpValues);
    setOTP(newOtpValues.join(''));

    if (value !== '' && index < 5) {
      const nextInput = document.getElementById(`otp-${index + 1}`);
      nextInput?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && index > 0 && otpValues[index] === '') {
      const prevInput = document.getElementById(`otp-${index - 1}`);
      prevInput?.focus();
    }
  };

  const handleResendOTP = async () => {
    try {
      setLoading(true);
      const formattedPhone = '+91' + phoneNumber.replace(/\s+/g, '');
      
      const { error } = await supabase.auth.signInWithOtp({
        phone: formattedPhone,
      });

      if (error) throw error;
      
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

  return (
    <AuthLayout>
      <div className="bg-white rounded-lg shadow-xl overflow-hidden">
        {/* Logo and Welcome Section */}
        {!showOTP && (
          <div className="bg-[#F3F4F6] px-6 pt-6 pb-8">
            <Image
              src="/logo-dark-login.svg"
              alt="ReviseTax"
              width={92}
              height={24}
              priority
              className="mb-6"
            />
            <h1 className="text-[#111827] mb-2" style={{
              fontFamily: 'Cabinet Grotesk Variable',
              fontWeight: 700,
              fontSize: '24px',
              lineHeight: '100%',
              letterSpacing: '0%',
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
        <div className={showOTP ? '' : 'p-6'}>
          {!showOTP ? (
            <>
              {/* Full Name Input */}
              <div className="mb-6">
                <label htmlFor="fullName" className="block text-[#111827] text-base mb-2">
                  Full Name
                </label>
                <input
                  id="fullName"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full h-12 px-4 bg-[#F9FAFB] border border-[#D1D5DB] rounded text-[#111827] placeholder-[#6B7280] focus:ring-2 focus:ring-[#FF4400] focus:border-[#FF4400] outline-none"
                  placeholder="Enter your full name"
                />
              </div>

              {/* Email Input */}
              <div className="mb-6">
                <label htmlFor="email" className="block text-[#111827] text-base mb-2">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-12 px-4 bg-[#F9FAFB] border border-[#D1D5DB] rounded text-[#111827] placeholder-[#6B7280] focus:ring-2 focus:ring-[#FF4400] focus:border-[#FF4400] outline-none"
                  placeholder="Enter your email"
                />
              </div>

              {/* Phone Input */}
              <div className="mb-6">
                <label htmlFor="phone" className="block text-[#111827] text-base mb-2">
                  Phone Number
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7280]">
                    +91
                  </span>
                  <input
                    id="phone"
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(formatPhoneNumber(e.target.value))}
                    className="w-full h-12 pl-12 pr-4 bg-[#F9FAFB] border border-[#D1D5DB] rounded text-[#111827] placeholder-[#6B7280] focus:ring-2 focus:ring-[#FF4400] focus:border-[#FF4400] outline-none"
                    placeholder="Enter your 10-digit number"
                    maxLength={10}
                  />
                </div>
              </div>

              {/* Create Account Button */}
              <button
                onClick={handleCreateAccount}
                disabled={loading || !fullName || !email || !validatePhoneNumber(phoneNumber)}
                className="w-full h-12 bg-[#FF4400] text-white font-semibold rounded hover:bg-[#E63D00] transition-colors duration-200 disabled:opacity-50 mb-6"
              >
                {loading ? 'Processing...' : 'Create Account'}
              </button>

              {/* Sign In Link */}
              <div className="text-center">
                <p className="text-[#111827]">
                  Already have an account?{' '}
                  <Link href="/auth/signin" className="text-[#FF4400] hover:text-[#E63D00] transition-colors duration-200">
                    Sign in
                  </Link>
                </p>
              </div>
            </>
          ) : (
            <OTPInput
              otpValues={otpValues}
              onChange={handleOtpChange}
              onKeyDown={handleKeyDown}
              phoneNumber={phoneNumber}
              onVerify={handleVerifyOTP}
              onCancel={() => setShowOTP(false)}
              onResendOTP={handleResendOTP}
              isVerifying={loading}
            />
          )}
        </div>
      </div>
      <Toaster />
    </AuthLayout>
  );
}

export default function SignUp() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SignUpContent />
    </Suspense>
  );
}