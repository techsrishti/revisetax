'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import AuthLayout from '../components/AuthLayout';
import OTPInput from '../components/OTPInput';
import { supabase } from '@/lib/supabase';

export default function SignUp() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [phoneNumber, setPhoneNumber] = useState(searchParams.get('phone') || '');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
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

  const handleCreateAccount = async () => {
    try {
      if (!validatePhoneNumber(phoneNumber)) {
        setError('Please enter a valid 10-digit phone number');
        return;
      }
    
      setLoading(true);
      setError('');
      const formattedPhone = phoneNumber.startsWith('+91') ? phoneNumber : '+91' + phoneNumber.replace(/\s+/g, '');
      
      // First create user in database
      const response = await fetch('/api/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: fullName,
          email,
          phoneNumber: formattedPhone,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to create account');
      }

      // If user creation successful, send OTP
      const { error: otpError } = await supabase.auth.signInWithOtp({
        phone: formattedPhone,
      });

      if (otpError) throw otpError;
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
      router.push('/new-dashboard');
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

  return (
    <AuthLayout>
      <div className={`bg-white rounded-[8px] shadow-xl w-[472px] ${showOTP ? 'h-[400px]' : 'h-[700px]'} p-1 font-inter transition-all duration-300`}>
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
          <h1 className="text-2xl font-semibold font-inter text-gray-900">
            Create Account
          </h1>
          <p className="text-gray-600 text-sm font-inter">
            Seems like you don't have an account with us yet. We just need your name and email.
          </p>
        </div>

        <div className="space-y-6 px-6">
          {!showOTP ? (
            <>
              <div className="flex justify-center my-8">
                <div className="w-[400px] space-y-2">
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

              <div className="flex justify-center my-8">
                <div className="w-[400px] space-y-2">
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
                  onClick={handleCreateAccount}
                  disabled={loading || !fullName || !email || !phoneNumber}
                  className="w-[400px] h-[48px] px-8 py-3 rounded-md bg-[#E9420C] text-white hover:bg-[#E63D00] transition-colors duration-200 font-bold disabled:opacity-50 cursor-pointer"
                >
                  {loading ? 'Processing...' : 'Create Account'}
                </button>

                <div className="text-center mt-6">
                  <Link
                    href="/auth/signin"
                    className="font-inter-variable text-[#FF4400] hover:text-[#E63D00] transition-colors duration-200"
                  >
                    Already have an account? Sign in
                  </Link>
                </div>
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
                <div className="flex justify-centzer">
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