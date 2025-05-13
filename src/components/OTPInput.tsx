import { KeyboardEvent } from 'react';

interface OTPInputProps {
  otpValues: string[];
  onChange: (index: number, value: string) => void;
  onKeyDown: (index: number, e: KeyboardEvent<HTMLInputElement>) => void;
  phoneNumber: string;
  onResendOTP?: () => void;
  onVerify: () => void;
  onCancel: () => void;
  isVerifying?: boolean;
}

export default function OTPInput({ 
  otpValues, 
  onChange, 
  onKeyDown, 
  phoneNumber, 
  onResendOTP,
  onVerify,
  onCancel,
  isVerifying = false 
}: OTPInputProps) {
  const isComplete = otpValues.every(value => value !== '');

  return (
    <div className="w-full max-w-[472px] min-h-[380px] bg-white p-2 md:p-4 mx-auto">
      {/* First Section - Back and Info */}
      <div className="w-full max-w-[404px] mx-auto mb-4">
        {/* Back Button */}
        <button 
          onClick={onCancel}
          className="flex items-center gap-2 text-gray-900 hover:text-gray-700 mb-4 md:mb-6"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M15.8337 10H4.16699M4.16699 10L10.0003 15.8333M4.16699 10L10.0003 4.16667" 
              stroke="currentColor" strokeWidth="1.67" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="font-inter-variable font-bold text-base leading-none">Back</span>
        </button>

        {/* OTP Info */}
        <div className="space-y-5">
          <h2 className="font-cabinet-grotesk-variable font-bold text-xl md:text-2xl leading-tight tracking-normal tabular-nums text-gray-900">
            OTP Sent to +91 {phoneNumber}
          </h2>
          <p className="font-inter-variable font-normal text-sm md:text-base leading-relaxed md:leading-[28px] text-gray-600 tabular-nums">
            Please enter the 6-digit code we sent to your mobile number. 
            {onResendOTP && (
              <button 
                onClick={onResendOTP}
                className="text-[#FF4400] hover:text-[#E63D00] ml-1 font-medium"
              >
                Resend OTP
              </button>
            )}
          </p>
        </div>
      </div>

      {/* Second Section - OTP Input */}
      <div className="w-full max-w-[404px] mx-auto mb-4 mt-10">
        <div className="flex flex-col gap-2">
          <label className="block text-sm font-medium text-gray-900">
            Enter OTP
          </label>
          <div className="grid grid-cols-6 gap-[8px]">
            {otpValues.map((value, index) => (
              <input
                key={index}
                id={`otp-${index}`}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={value}
                onChange={(e) => onChange(index, e.target.value)}
                onKeyDown={(e) => onKeyDown(index, e)}
                className="w-[64px] h-[64px] px-[8px] py-[2px] text-center text-lg md:text-xl font-medium bg-white border border-gray-300 rounded-[8px] focus:ring-2 focus:ring-[#FF4400] focus:border-[#FF4400] outline-none"
                placeholder="-"
              />
            ))}
          </div>
        </div>
      </div>

      {/* Third Section - Action Buttons */}
      <div className="w-full max-w-[404px] mx-auto space-y-2 pb-2">
        <button 
          onClick={onVerify}
          disabled={!isComplete || isVerifying}
          className="w-full h-9 md:h-10 bg-[#FF4400] text-white font-medium rounded hover:bg-[#E63D00] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm md:text-base"
        >
          {isVerifying ? 'Verifying...' : 'Verify OTP and Continue'}
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