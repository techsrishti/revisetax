import { KeyboardEvent } from 'react';

interface OTPInputProps {
  otpValues: string[];
  onChange: (index: number, value: string) => void;
  onKeyDown: (index: number, e: KeyboardEvent<HTMLInputElement>) => void;
}

export default function OTPInput({ otpValues, onChange, onKeyDown }: OTPInputProps) {
  return (
    <div className="w-[400px] space-y-2">
      <label htmlFor="otp-0" className="block font-inter-variable text-base leading-none text-[#111827]">
        Enter OTP
      </label>
      <div className="flex gap-2 justify-between">
        {otpValues.map((value, index) => (
          <input
            key={index}
            id={`otp-${index}`}
            type="text"
            maxLength={1}
            value={value}
            onChange={(e) => onChange(index, e.target.value)}
            onKeyDown={(e) => onKeyDown(index, e)}
            className="w-[60px] h-[60px] rounded-lg border border-[#D9D9D9] bg-[#FAFAFA] focus:ring-2 focus:ring-[#FF4400] focus:border-[#FF4400] focus:outline-none font-inter-variable text-xl text-center text-black"
          />
        ))}
      </div>
    </div>
  );
}