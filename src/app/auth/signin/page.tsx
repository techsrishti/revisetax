'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import AuthLayout from '../components/AuthLayout';
import OTPInput from '../components/OTPInput';
import { supabase } from '@/lib/supabase';
 
export default function SignIn() {
  const router = useRouter();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [showOTP, setShowOTP] = useState(false);
  const [otp, setOTP] = useState('');
  const [error, setError] = useState('');
  const [otpValues, setOtpValues] = useState(['', '', '', '', '', '']);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

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
        setError('Please enter a valid 10-digit phone number');
        return;
      }
      
      setLoading(true);
      setError('');
      const formattedPhone = '+91' + phoneNumber.replace(/\s+/g, '');
      
      // Check if user exists in database
      const user = await fetch('/api/check-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phoneNumber: formattedPhone }),
      }).then(res => res.json());

      if (!user) {
        // Redirect to signup if user doesn't exist
        router.push(`/auth/signup?phone=${encodeURIComponent(phoneNumber.replace(/\s+/g, ''))}`);
        return;
      }

      // If user exists, continue with OTP flow
      const { error } = await supabase.auth.signInWithOtp({
        phone: formattedPhone,
      });

      if (error) throw error;
      setShowOTP(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    try {
      setLoading(true);
      setError('');
      const formattedPhone = '+91' + phoneNumber.replace(/\s+/g, '');
      
      const { error } = await supabase.auth.verifyOtp({
        phone: formattedPhone,
        token: otp,
        type: 'sms'
      });

      if (error) throw error;
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
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
      setError('');
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`
        }
      });
      if (error) throw error;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleLinkedInSignIn = async () => {
    try {
      setLoading(true);
      setError('');
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'linkedin_oidc',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`
        }
      });
      if (error) throw error;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className="bg-white rounded-[8px] shadow-xl w-[472px] h-[630px] p-1 font-inter -mt-20">
        <div className="w-full h-[188px] p-6 space-y-6 bg-[#F3F4F6] rounded-t-lg">
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
          <h1 className="font-cabinet-grotesk font-bold text-2xl leading-none tracking-normal tabular-nums text-[#111827] mb-4">
            Welcome to <span className="text-[#FF4400]">ReviseTax</span>
          </h1>
          <div className="space-y-1">
            <p className="font-inter-variable text-base text-[#4B5563]">
              Your number is used to log in to your account or
            </p>
            <p className="font-inter-variable text-base text-[#4B5563]">
              create one if it doesn't exist.
            </p>
          </div>
        </div>

        <div className="space-y-6 px-6">
          {!showOTP ? (
            <>
              <div className="flex justify-center my-8">
                <div className="w-[400px] h-[72px] space-y-2">
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

              {error && (
                <div className="flex justify-center">
                  <div className="text-red-500 text-sm w-[400px]">{error}</div>
                </div>
              )}

              <div className="flex flex-col items-center gap-4">
                <button
                  onClick={handlePhoneSignIn}
                  disabled={loading}
                  className="w-[400px] h-[48px] px-8 py-3 rounded-md bg-[#E9420C] text-white hover:bg-[#E63D00] transition-colors duration-200 font-bold disabled:opacity-50 cursor-pointer"
                >
                  {loading ? 'Processing...' : 'Send OTP'}
                </button>

                <div className="w-[400px] relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-300"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-white text-gray-500">Or continue with</span>
                  </div>
                </div>

                <button
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                  className="w-[400px] bg-white border border-gray-300 text-gray-700 py-2.5 rounded-lg hover:bg-gray-50 transition-all duration-200 font-medium flex items-center justify-center gap-3 hover:shadow-md cursor-pointer"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  <span>Continue with Google</span>
                </button>

                <button
                  onClick={handleLinkedInSignIn}
                  disabled={loading}
                  className="w-[400px] bg-white border border-gray-300 text-gray-700 py-2.5 rounded-lg hover:bg-gray-50 transition-all duration-200 font-medium flex items-center justify-center gap-3 hover:shadow-md cursor-pointer"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#0A66C2" xmlns="http://www.w3.org/2000/svg">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                  </svg>
                  <span>Continue with LinkedIn</span>
                </button>
              </div>

              <div className="text-center mt-6">
                <Link
                  href="/auth/signup"
                  className="font-inter-variable text-[#FF4400] hover:text-[#E63D00] transition-colors duration-200"
                >
                  Don't have an account? Create one
                </Link>
              </div>
            </>
          ) : (
            <>
              <OTPInput
                otpValues={otpValues}
                onChange={handleOtpChange}
                onKeyDown={handleKeyDown}
              />

              {error && (
                <div className="flex justify-center">
                  <div className="text-red-500 text-sm w-[400px]">{error}</div>
                </div>
              )}

              <div className="flex justify-center">
                <button
                  onClick={handleVerifyOTP}
                  disabled={loading || otp.length !== 6}
                  className="w-[400px] h-[48px] px-8 py-3 rounded-md bg-[#E9420C] text-white hover:bg-[#E63D00] transition-colors duration-200 font-bold disabled:opacity-50 cursor-pointer"
                >
                  {loading ? 'Verifying...' : 'Verify OTP and Continue'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </AuthLayout>
  );
}