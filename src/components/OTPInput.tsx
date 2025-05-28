import { KeyboardEvent } from 'react';
import Image from 'next/image';
import styles from '@/app/auth/styles.module.css';

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
  resendOTPDisabled = false
}: OTPInputProps) {
  const isComplete = otpValue.length === 6;

  return (
    <div className={styles.otpContainer}>
      {/* First Section - Back and Info */}
      <div className={styles.otpSection}>
        <div className={styles.otpSectionContent}>
          {/* Back Button */}
          <button 
            onClick={onCancel}
            className={styles.backButton}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M15.8337 10H4.16699M4.16699 10L10.0003 15.8333M4.16699 10L10.0003 4.16667" 
                stroke="currentColor" strokeWidth="1.67" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className={styles.backButtonText}>Back</span>
          </button>

          {/* OTP Info */}
          <div className={styles.otpInfoContainer}>
            <h2 className={styles.otpTitle}>
              OTP Sent to +91 {phoneNumber}
            </h2>
            <p className={styles.otpDescription}>
              Please enter the 6-digit code we sent to your mobile number. 
              {onResendOTP && (
                <button 
                  onClick={onResendOTP}
                  className={styles.resendButton}
                  disabled={resendOTPDisabled}
                >
                  {resendOTPDisabled && resendOTPTimer > 0 ? `Resend OTP (${resendOTPTimer}s)` : 'Resend OTP'}
                </button>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Second Section - OTP Input */}
      <div className={styles.otpInputSection}>
        <div className={styles.otpInputContainer}>
          <label className={styles.otpInputLabel}>
            Enter OTP
          </label>
          <input
            id="otp-input"
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={otpValue}
            onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
            className={styles.otpInput}
           />
        </div>
      </div>

      {/* Third Section - Action Buttons */}
      <div className={styles.otpButtonsSection}>
        <button 
          onClick={onVerify}
          disabled={!isComplete || isVerifying}
          className={styles.verifyButton}
        >
          {isVerifying ? (
            <span className={styles.verifyButtonContent}>
              <Image src="/Loading3Quarters%20(1).svg" alt="Loading" width={20} height={20} className={styles.verifySpinner} />
              Verifying...
            </span>
          ) : 'Verify OTP and Continue'}
        </button>
        <button 
          onClick={onCancel}
          className={styles.cancelButton}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}