import { KeyboardEvent } from 'react';
import Image from 'next/image';

interface OTPInputProps {
  otpValue: string;
  onChange: (value: string) => void;
  phoneNumber: string;
  onResendOTP?: () => void;
  onVerify: () => void;
  onCancel: () => void;
  isVerifying?: boolean;
  resendOTPTimer?: number; // seconds left for resend
  resendOTPDisabled?: boolean;
  isSignUp?: boolean; // to differentiate between signup and signin
}

export default function OTPInput({ 
  otpValue, 
  onChange, 
  phoneNumber, 
  onResendOTP,
  onVerify,
  onCancel,
  isVerifying = false,
  resendOTPTimer = 0,
  resendOTPDisabled = false,
  isSignUp = false
}: OTPInputProps) {
  const isComplete = otpValue.length === 6;

  return (
    <div className="w-full max-w-[472px] min-h-[320px] bg-white p-2 md:p-3 mx-auto">
      {/* First Section - Back and Info */}
      <div className="w-full max-w-[404px] mx-auto mb-3">
        {/* Back Button */}
        <button 
          onClick={onCancel}
          className="flex items-center gap-2 text-gray-900 hover:text-gray-700 mb-3 md:mb-4"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M15.8337 10H4.16699M4.16699 10L10.0003 15.8333M4.16699 10L10.0003 4.16667" 
              stroke="currentColor" strokeWidth="1.67" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="font-inter-variable font-bold text-base leading-none">Back</span>
        </button>

        {/* OTP Info */}
        <div className="space-y-3">
          <h2 className="font-cabinet-grotesk-variable font-bold text-xl md:text-2xl leading-tight tracking-normal tabular-nums text-gray-900">
            OTP Sent to +91 {phoneNumber}
          </h2>
          <p className="font-inter-variable font-normal text-sm md:text-base leading-relaxed md:leading-[24px] text-gray-600 tabular-nums">
            Please enter the 6-digit code we sent to your mobile number. 
            {onResendOTP && (
              <button 
                onClick={onResendOTP}
                className="text-[#FF4400] hover:text-[#E63D00] ml-1 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={resendOTPDisabled}
              >
                {resendOTPDisabled && resendOTPTimer > 0 ? `Resend OTP (${resendOTPTimer}s)` : 'Resend OTP'}
              </button>
            )}
          </p>
        </div>
      </div>

      {/* Second Section - OTP Input */}
      <div className="w-full max-w-[404px] mx-auto mb-3 mt-6">
        <div className="flex flex-col gap-2">
          <label className="block text-sm font-medium text-gray-900">
            Enter OTP
          </label>
          <input
            id="otp-input"
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={otpValue}
            onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
            className="w-full h-[56px] px-[6px] py-[2px] text-center text-lg md:text-xl font-medium bg-white border border-gray-300 rounded-[8px] focus:ring-2 focus:ring-[#FF4400] focus:border-[#FF4400] outline-none"
           />
        </div>
      </div>

      {/* Third Section - Action Buttons */}
      <div className="w-full max-w-[404px] mx-auto space-y-2 pb-1">
        <button 
          onClick={onVerify}
          disabled={!isComplete || isVerifying}
          className="w-full h-9 md:h-10 bg-[#FF4400] text-white font-medium rounded hover:bg-[#E63D00] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm md:text-base"
        >
          {isVerifying ? (
            <span className="flex items-center justify-center gap-2">
              <Image src="/Loading3Quarters%20(1).svg" alt="Loading" width={20} height={20} className="animate-spin" />
              {otpValue.length === 6 ? 
                (isSignUp ? 'Creating account...' : 'Logging in...') : 
                'Verifying...'
              }
            </span>
          ) : 'Verify OTP and Continue'}
        </button>
        <button 
          onClick={onCancel}
          className="w-full h-9 md:h-10 bg-white text-gray-900 border border-gray-300 rounded font-medium hover:bg-gray-50 transition-colors text-sm md:text-base"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}