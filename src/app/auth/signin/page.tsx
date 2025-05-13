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
 
function SignInContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [showOTP, setShowOTP] = useState(false);
  const [otp, setOTP] = useState('');
  const [otpValues, setOtpValues] = useState(['', '', '', '', '', '']);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
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
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [searchParams, toast]);

  const formatPhoneNumber = (value: string) => {
    return value.replace(/\D/g, '');
  };

  const validatePhoneNumber = (phone: string) => {
    const digits = phone.replace(/\D/g, '');
    return digits.length === 10;
  };

  const handlePhoneSignIn = async () => {
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
      
      // Check if user exists in database
      const response = await fetch('/api/check-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phoneNumber: formattedPhone }),
      });

      const userExists = await response.json();

      if (!userExists) {
        toast({
          title: "Account Not Found",
          description: "This phone number is not registered. Please create a new account",
          variant: "destructive",
          duration: 4000,
        });
        router.push(`/auth/signup?phone=${encodeURIComponent(phoneNumber.replace(/\s+/g, ''))}`);
        return;
      }

      // If user exists, continue with OTP flow
      const { error } = await supabase.auth.signInWithOtp({
        phone: formattedPhone,
      });

      if (error) throw error;
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
        // Update last login time
        const updateResponse = await fetch('/api/update-last-login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            phoneNumber: formattedPhone,
          }),
        });

        if (!updateResponse.ok) {
          const errorData = await updateResponse.json();
          throw new Error(errorData.message || 'Failed to update last login time');
        }

        toast({
          title: "Success",
          description: "Successfully logged in!",
          duration: 2000,
        });

        // Redirect to dashboard on successful verification
        router.push('/dashboard');
      } catch (updateError) {
        // Log the error but don't prevent login
        console.error('Failed to update last login time:', updateError);
        toast({
          title: "Warning",
          description: "Logged in successfully, but failed to update last login time.",
          duration: 4000,
        });
        router.push('/dashboard');
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

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
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
          <h1 className="text-[#111827] text-2xl font-bold mb-2" style={{
            fontFamily: 'Cabinet Grotesk Variable',
            fontWeight: 700,
            fontSize: '24px',
            lineHeight: '100%',
            letterSpacing: '0%',
            fontVariantNumeric: 'lining-nums tabular-nums'
          }}>
            Welcome to <span className="text-[#FF4400]">ReviseTax</span>
          </h1>
          <p className="text-[#4B5563] text-base">
            Your number is used to log in to your account or create one if it doesn't exist.
          </p>
        </div>
        )}

        {/* Form Section */}
        <div className="p-6">
          {!showOTP ? (
            <>
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

              {/* Send OTP Button */}
              <button
                onClick={handlePhoneSignIn}
                disabled={loading}
                className="w-full h-12 bg-[#FF4400] text-white font-semibold rounded hover:bg-[#E63D00] transition-colors duration-200 disabled:opacity-50 mb-4"
              >
                {loading ? 'Processing...' : 'Send OTP'}
              </button>

              {/* Divider */}
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-[#E5E7EB]"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-[#6B7280]">Or continue with</span>
                </div>
              </div>

              {/* Social Buttons */}
              <div className="space-y-4">
                <button
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                  className="w-full h-12 flex items-center justify-center gap-2 bg-white border border-[#D1D5DB] rounded text-[#374151] hover:bg-[#F9FAFB] transition-colors duration-200"
                >
                  <Image src="/google.svg" alt="Google" width={20} height={20} />
                  <span>Continue with Google</span>
                </button>
                <button
                  onClick={handleLinkedInSignIn}
                  disabled={loading}
                  className="w-full h-12 flex items-center justify-center gap-2 bg-white border border-[#D1D5DB] rounded text-[#374151] hover:bg-[#F9FAFB] transition-colors duration-200"
                >
                  <Image src="/linkedin.svg" alt="LinkedIn" width={20} height={20} />
                  <span>Continue with LinkedIn</span>
                </button>
              </div>

              {/* Create Account Link */}
              <div className="text-center mt-6">
                <p className="text-[#111827]">
                  Don't have an account?{' '}
                  <Link href="/auth/signup" className="text-[#FF4400] hover:text-[#E63D00] transition-colors duration-200">
                    Create one
                  </Link>
                </p>
              </div>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>
      <Toaster />
    </AuthLayout>
  );
}

export default function SignIn() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SignInContent />
    </Suspense>
  );
}