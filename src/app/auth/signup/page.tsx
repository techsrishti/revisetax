'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import AuthLayout from '../../../components/AuthLayout';
import OTPInput from '../../../components/OTPInput';
import { supabase } from '@/utils/supabase/supabase';
import { useToast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";

export default function SignUp() {
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
    <>
      <AuthLayout>
        <div className="bg-white rounded-[8px] shadow-xl w-[472px] p-1 font-inter -mt-20">
          {!showOTP ? (
            <>
              <div className="w-[464px] h-[188px] p-[24px] space-y-[24px] bg-[#F3F4F6] rounded-t-[4px]">
                <div>
                  <Image
                    src="/logo-dark-login.svg"
                    alt="ReviseTax Logo"
                    width={91.734}
                    height={24}
                    priority
                    className="w-[91.734px] h-6"
                  />
                </div>
                <h1 className="font-cabinet-grotesk-variable font-bold text-2xl leading-none tracking-normal tabular-nums text-[#111827] mb-4">
                  Create Account
                </h1>
                <div className="w-[400px] h-[56px]">
                  <p className="font-inter-variable text-[16px] leading-[28px] font-normal">
                    Seems like you don't have an account with us yet. We just need your name and email.
                  </p>
                </div>
              </div>

              <div className="space-y-6 px-6">
                <div className="flex justify-center mt-4 mb-8">
                  <div className="w-[450px] space-y-2">
                    <label htmlFor="fullName" className="block font-inter-variable text-base leading-none text-[#111827]">
                      Full Name
                    </label>
                    <input
                      id="fullName"
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full h-[48px] px-4 rounded-lg border border-[#D9D9D9] bg-[#FAFAFA] focus:ring-2 focus:ring-[#FF4400] focus:border-[#FF4400] focus:outline-none font-inter-variable text-base leading-none text-black placeholder:text-[#5B6976] placeholder:font-inter-variable placeholder:text-base placeholder:leading-none"
                      placeholder="Enter your full name"
                      disabled={loading}
                    />
                  </div>
                </div>

                <div className="flex justify-center mb-8">
                  <div className="w-[450px] space-y-2">
                    <label htmlFor="email" className="block font-inter-variable text-base leading-none text-[#111827]">
                      Email
                    </label>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full h-[48px] px-4 rounded-lg border border-[#D9D9D9] bg-[#FAFAFA] focus:ring-2 focus:ring-[#FF4400] focus:border-[#FF4400] focus:outline-none font-inter-variable text-base leading-none text-black placeholder:text-[#5B6976] placeholder:font-inter-variable placeholder:text-base placeholder:leading-none"
                      placeholder="Enter your email"
                      disabled={loading}
                    />
                  </div>
                </div>

                <div className="flex justify-center mb-8">
                  <div className="w-[450px] h-[75px] space-y-2">
                    <label htmlFor="phone" className="block font-inter-variable text-base leading-none text-[#111827]">
                      Phone Number
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 font-inter-variable text-base leading-none text-[#5B6976]">
                        +91
                      </span>
                      <input
                        id="phone"
                        type="tel"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(formatPhoneNumber(e.target.value))}
                        className="w-full h-[48px] pl-12 pr-4 rounded-lg border border-[#D9D9D9] bg-[#FAFAFA] focus:ring-2 focus:ring-[#FF4400] focus:border-[#FF4400] focus:outline-none font-inter-variable text-base leading-none text-black placeholder:text-[#5B6976] placeholder:font-inter-variable placeholder:text-base placeholder:leading-none"
                        placeholder="Enter your 10-digit number"
                        disabled={loading}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-center gap-4">
                  <button
                    onClick={handleCreateAccount}
                    disabled={loading || !fullName || !email || !phoneNumber}
                    className="w-[410px] h-[48px] px-8 py-3 rounded-md bg-[#E9420C] text-white hover:bg-[#E63D00] transition-colors duration-200 font-bold disabled:opacity-50 cursor-pointer"
                  >
                    {loading ? 'Processing...' : 'Create Account'}
                  </button>

                  <div className="text-center mt-6">
                    <Link
                      href={`/auth/signin?fromSocial=true${socialProvider ? `&email=${encodeURIComponent(email)}&provider=${encodeURIComponent(socialProvider)}&providerId=${encodeURIComponent(socialProviderId)}` : ''}`}
                      className="font-inter-variable"
                    >
                      <span className="text-black">Already have an account? </span>
                      <span className="text-[#FF4400] hover:text-[#E63D00] transition-colors duration-200">Sign in</span>
                    </Link>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <OTPInput
              otpValues={otpValues}
              onChange={handleOtpChange}
              onKeyDown={handleKeyDown}
              phoneNumber={phoneNumber}
              onResendOTP={handleResendOTP}
              onVerify={handleVerifyOTP}
              onCancel={() => setShowOTP(false)}
              isVerifying={loading}
            />
          )}

          {error && (
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
              <div className="text-red-500 text-sm">{error}</div>
            </div>
          )}
        </div>
      </AuthLayout>
      <Toaster />
    </>
  );
}