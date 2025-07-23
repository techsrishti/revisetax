'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Eye, EyeOff, Shield, Smartphone, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import ReCAPTCHA from 'react-google-recaptcha';

// Rate limiting configuration
const MAX_ATTEMPTS = 3; // Lock after 3 failed attempts
const LOCKOUT_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds
const ATTEMPT_WINDOW = 10 * 60 * 1000; // 10 minutes window for tracking attempts

interface AttemptData {
  count: number;
  firstAttempt: number;
  lockedUntil?: number;
}

export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [step, setStep] = useState<'credentials' | 'mfa'>('credentials');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isSettingUpMFA, setIsSettingUpMFA] = useState(false);
  const [mfaSetupStep, setMfaSetupStep] = useState<'qr' | 'verify' | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [factorId, setFactorId] = useState('');
  const [challengeId, setChallengeId] = useState('');
  
  // reCAPTCHA states
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);
  const recaptchaRef = useRef<ReCAPTCHA>(null);
  
  // Rate limiting states
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [lockoutTimeRemaining, setLockoutTimeRemaining] = useState(0);
  const [attemptsRemaining, setAttemptsRemaining] = useState(MAX_ATTEMPTS);
  
  const supabase = createClient();
  const router = useRouter();

  // Handle reCAPTCHA response
  const handleRecaptchaChange = (token: string | null) => {
    setRecaptchaToken(token);
  };

  // Verify reCAPTCHA token with server
  const verifyRecaptcha = async (token: string): Promise<boolean> => {
    try {
      const response = await fetch('/api/verify-recaptcha', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      });

      const result = await response.json();
      return result.success;
    } catch (error) {
      console.error('reCAPTCHA verification error:', error);
      return false;
    }
  };

  // Rate limiting functions
  const getAttemptData = (): AttemptData => {
    const stored = localStorage.getItem('admin_login_attempts');
    if (!stored) return { count: 0, firstAttempt: Date.now() };
    return JSON.parse(stored);
  };

  const updateAttemptData = (data: AttemptData) => {
    localStorage.setItem('admin_login_attempts', JSON.stringify(data));
  };

  const checkRateLimit = (): boolean => {
    const now = Date.now();
    const attemptData = getAttemptData();

    // Check if currently locked out
    if (attemptData.lockedUntil && now < attemptData.lockedUntil) {
      setIsRateLimited(true);
      setLockoutTimeRemaining(Math.ceil((attemptData.lockedUntil - now) / 1000));
      return false;
    }

    // Reset attempts if window has passed
    if (now - attemptData.firstAttempt > ATTEMPT_WINDOW) {
      const newData = { count: 0, firstAttempt: now };
      updateAttemptData(newData);
      setAttemptsRemaining(MAX_ATTEMPTS);
      setIsRateLimited(false);
      return true;
    }

    // Check if should be locked out
    if (attemptData.count >= MAX_ATTEMPTS) {
      const lockoutData = {
        ...attemptData,
        lockedUntil: now + LOCKOUT_DURATION
      };
      updateAttemptData(lockoutData);
      setIsRateLimited(true);
      setLockoutTimeRemaining(Math.ceil(LOCKOUT_DURATION / 1000));
      return false;
    }

    setAttemptsRemaining(MAX_ATTEMPTS - attemptData.count);
    return true;
  };

  const recordFailedAttempt = () => {
    const now = Date.now();
    const attemptData = getAttemptData();
    
    // Reset if outside window
    if (now - attemptData.firstAttempt > ATTEMPT_WINDOW) {
      const newData = { count: 1, firstAttempt: now };
      updateAttemptData(newData);
      setAttemptsRemaining(MAX_ATTEMPTS - 1);
    } else {
      const newData = {
        ...attemptData,
        count: attemptData.count + 1
      };
      updateAttemptData(newData);
      setAttemptsRemaining(MAX_ATTEMPTS - newData.count);
    }

    checkRateLimit();
  };

  const resetAttempts = () => {
    localStorage.removeItem('admin_login_attempts');
    setAttemptsRemaining(MAX_ATTEMPTS);
    setIsRateLimited(false);
  };

  // Countdown timer for lockout
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isRateLimited && lockoutTimeRemaining > 0) {
      interval = setInterval(() => {
        setLockoutTimeRemaining(prev => {
          if (prev <= 1) {
            setIsRateLimited(false);
            checkRateLimit();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRateLimited, lockoutTimeRemaining]);

  // Check rate limit on component mount
  useEffect(() => {
    checkRateLimit();
  }, []);

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const updateAdminSession = async () => {
    try {
      // Use getUser() for secure user verification
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        throw new Error('No authenticated user found');
      }

      const response = await fetch('/api/admin/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.id}` // Use user ID from verified user data
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update admin session');
      }
    } catch (error) {
      console.error('Error updating admin session:', error);
      throw error;
    }
  };

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check rate limiting
    if (!checkRateLimit()) {
      return;
    }

    // Validate reCAPTCHA (only if configured)
    if (process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY) {
      if (!recaptchaToken) {
        setError('Please complete the reCAPTCHA verification.');
        return;
      }

      // Verify reCAPTCHA token with server
      const isRecaptchaValid = await verifyRecaptcha(recaptchaToken);
      if (!isRecaptchaValid) {
        setError('reCAPTCHA verification failed. Please try again.');
        setRecaptchaToken(null);
        recaptchaRef.current?.reset();
        return;
      }
    }

    setIsLoading(true);
    setError('');

    try {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) throw signInError;

      // Success - reset attempts only (keep reCAPTCHA valid)
      resetAttempts();

      // Check for TOTP factors
      const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (factorsError) throw factorsError;

      const totpFactor = factorsData.totp?.find(factor => factor.status === 'verified') || factorsData.totp?.[0];

      // If no verified TOTP factor exists, require setup
      if (!totpFactor || totpFactor.status !== 'verified') {
        // Clean up any unverified factors first
        if (factorsData.totp?.length > 0) {
          for (const factor of factorsData.totp) {
            if (factor.status !== 'verified') {
              try {
                await supabase.auth.mfa.unenroll({ factorId: factor.id });
              } catch (cleanupError) {
                console.warn('Failed to cleanup unverified factor:', cleanupError);
              }
            }
          }
        }

        // Start new TOTP enrollment with a friendly name
        const { data: enrollData, error: enrollError } = await supabase.auth.mfa.enroll({
          factorType: 'totp',
          friendlyName: 'Admin Authenticator'
        });
        if (enrollError) throw enrollError;

        setIsSettingUpMFA(true);
        setMfaSetupStep('qr');
        setQrCodeUrl(enrollData.totp.qr_code);
        setFactorId(enrollData.id);

        // Also create a challenge for the enrollment verification
        const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
          factorId: enrollData.id
        });
        if (challengeError) throw challengeError;
        setChallengeId(challengeData.id);
      } else {
        // Challenge existing TOTP factor
        const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
          factorId: totpFactor.id
        });
        if (challengeError) throw challengeError;

        setFactorId(totpFactor.id);
        setChallengeId(challengeData.id);
        setStep('mfa');
      }
    } catch (error) {
      console.error('Login error:', error);
      setError(error instanceof Error ? error.message : 'Authentication failed');
      recordFailedAttempt();
      // Reset reCAPTCHA only on authentication failure
      setRecaptchaToken(null);
      recaptchaRef.current?.reset();
    } finally {
      setIsLoading(false);
    }
  };

  const handleMFASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const { data: verifyData, error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId,
        code: mfaCode
      });

      if (verifyError) throw verifyError;

      // After successful MFA verification, verify user authentication
      await supabase.auth.refreshSession();
      
      // Use getUser() for secure user verification
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        throw new Error('Failed to verify user after MFA verification');
      }

      // Update admin session with MFA verification status
      await updateAdminSession();

      // Redirect to dashboard only after successful MFA verification
      router.push('/admin-dashboard');
    } catch (error) {
      console.error('MFA verification error:', error);
      setError(error instanceof Error ? error.message : 'MFA verification failed');
      setMfaCode(''); // Clear the code on error
    } finally {
      setIsLoading(false);
    }
  };

  const handleMFASetupVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const { data: verifyData, error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId,
        code: mfaCode
      });

      if (verifyError) throw verifyError;

      // After successful MFA setup and verification, verify user authentication
      await supabase.auth.refreshSession();
      
      // Use getUser() for secure user verification
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        throw new Error('Failed to verify user after MFA setup');
      }

      // Update admin session with MFA verification status
      await updateAdminSession();

      // Redirect to dashboard only after successful MFA setup and verification
      router.push('/admin-dashboard');
    } catch (error) {
      console.error('MFA setup verification error:', error);
      setError(error instanceof Error ? error.message : 'MFA setup verification failed');
      setMfaCode(''); // Clear the code on error
    } finally {
      setIsLoading(false);
    }
  };

  // Add cleanup function for when user cancels MFA setup
  const handleCancelMFASetup = async () => {
    try {
      if (factorId) {
        await supabase.auth.mfa.unenroll({ factorId });
      }
      // Sign out the user if they cancel MFA setup since it's required
      await supabase.auth.signOut();
      setIsSettingUpMFA(false);
      setMfaSetupStep(null);
      setQrCodeUrl('');
      setFactorId('');
      setMfaCode('');
      setError('');
      setStep('credentials');
    } catch (error) {
      console.error('Error cleaning up MFA setup:', error);
    }
  };

  if (isSettingUpMFA) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-800 to-slate-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-orange-100">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="font-cabinet-grotesk-variable text-2xl font-bold text-gray-900">
              Setup Microsoft Authenticator
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Secure your admin account with two-factor authentication
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {mfaSetupStep === 'qr' && (
              <>
                <div className="space-y-4">
                  <div className="text-sm text-muted-foreground space-y-2">
                    <p className="font-medium">Step 1: Download Microsoft Authenticator</p>
                    <p>Install the Microsoft Authenticator app from your app store.</p>
                  </div>
                  
                  <div className="text-sm text-muted-foreground space-y-2">
                    <p className="font-medium">Step 2: Scan QR Code</p>
                    <p>Open the app and scan this QR code:</p>
                  </div>
                  
                  <div className="flex justify-center p-4 bg-white border rounded-lg">
                    {qrCodeUrl && (
                      qrCodeUrl.startsWith('data:image/svg+xml') ? (
                        <div 
                          dangerouslySetInnerHTML={{ 
                            __html: decodeURIComponent(qrCodeUrl.replace('data:image/svg+xml;utf-8,', ''))
                          }}
                          className="w-48 h-48 border rounded"
                        />
                      ) : (
                        <Image 
                          src={qrCodeUrl} 
                          alt="QR Code for Microsoft Authenticator" 
                          width={200} 
                          height={200}
                          className="border rounded"
                        />
                      )
                    )}
                  </div>
                  
                  <div className="text-sm text-muted-foreground">
                    <p className="font-medium">Step 3: Enter verification code</p>
                    <p>Enter the 6-digit code from Microsoft Authenticator to complete setup.</p>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Button 
                    onClick={() => setMfaSetupStep('verify')} 
                    className="w-full bg-primary hover:bg-primary/90"
                  >
                    I've scanned the QR code
                  </Button>
                  
                  <Button 
                    type="button" 
                    variant="outline" 
                    className="w-full"
                    onClick={handleCancelMFASetup}
                  >
                    Cancel Setup
                  </Button>
                </div>
              </>
            )}

            {mfaSetupStep === 'verify' && (
              <form onSubmit={handleMFASetupVerify} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="setup-code" className="text-sm font-medium text-gray-900">
                    Verification Code
                  </label>
                  <Input
                    id="setup-code"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    className="text-center text-lg tracking-widest"
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter the 6-digit code from Microsoft Authenticator
                  </p>
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Button 
                    type="submit" 
                    className="w-full bg-primary hover:bg-primary/90"
                    disabled={mfaCode.length !== 6 || isLoading}
                  >
                    {isLoading ? (
                      <span className="flex items-center gap-2">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
                        Verifying...
                      </span>
                    ) : (
                      'Complete Setup'
                    )}
                  </Button>
                  
                  <Button 
                    type="button" 
                    variant="outline" 
                    className="w-full"
                    onClick={handleCancelMFASetup}
                  >
                    Cancel Setup
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-800 to-slate-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-orange-100">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="font-cabinet-grotesk-variable text-2xl font-bold text-gray-900">
            Admin Login
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {step === 'credentials' 
              ? 'Sign in to your admin account' 
              : 'Enter your authentication code'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === 'credentials' ? (
            <>
              {/* Rate limiting warning */}
              {isRateLimited ? (
                <Alert variant="destructive" className="mb-4">
                  <Clock className="h-4 w-4" />
                  <AlertDescription>
                    Too many failed attempts. Please wait {formatTime(lockoutTimeRemaining)} before trying again.
                  </AlertDescription>
                </Alert>
              ) : attemptsRemaining < MAX_ATTEMPTS && (
                <Alert variant="default" className="mb-4 border-yellow-200 bg-yellow-50 text-yellow-800">
                  <AlertCircle className="h-4 w-4 text-yellow-600" />
                  <AlertDescription>
                    {attemptsRemaining} login attempt{attemptsRemaining !== 1 ? 's' : ''} remaining before temporary lockout.
                  </AlertDescription>
                </Alert>
              )}

              <form onSubmit={handleCredentialsSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium text-gray-900">
                    Email Address
                  </label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@company.com"
                    disabled={isRateLimited}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="password" className="text-sm font-medium text-gray-900">
                    Password
                  </label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      disabled={isRateLimited}
                      required
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                      disabled={isRateLimited}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-900">
                    Verification
                  </label>
                  <div className="flex justify-center">
                    {process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ? (
                      <ReCAPTCHA
                        ref={recaptchaRef}
                        sitekey={process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY}
                        onChange={handleRecaptchaChange}
                        theme="light"
                        size="normal"
                      />
                    ) : (
                      <div className="p-4 border-2 border-dashed border-gray-300 rounded-lg text-center">
                        <AlertCircle className="h-8 w-8 mx-auto text-yellow-500 mb-2" />
                        <p className="text-sm text-gray-600 mb-1">reCAPTCHA Not Configured</p>
                        <p className="text-xs text-gray-500">
                          Set NEXT_PUBLIC_RECAPTCHA_SITE_KEY environment variable
                        </p>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    {process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY 
                      ? 'Complete the reCAPTCHA verification to continue'
                      : 'reCAPTCHA configuration required for production'
                    }
                  </p>
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <Button 
                  type="submit" 
                  className="w-full bg-primary hover:bg-primary/90"
                  disabled={isLoading || isRateLimited}
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
                      Signing in...
                    </span>
                  ) : isRateLimited ? (
                    `Locked - ${formatTime(lockoutTimeRemaining)}`
                  ) : (
                    'Sign In'
                  )}
                </Button>
              </form>
            </>
          ) : (
            <form onSubmit={handleMFASubmit} className="space-y-4">
              <div className="text-center space-y-2 mb-6">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
                  <Smartphone className="h-6 w-6 text-blue-600" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Open Microsoft Authenticator app and enter the 6-digit code
                </p>
              </div>

              <div className="space-y-2">
                <label htmlFor="mfa-code" className="text-sm font-medium text-gray-900">
                  Authentication Code
                </label>
                <Input
                  id="mfa-code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="text-center text-lg tracking-widest"
                />
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Button 
                  type="submit" 
                  className="w-full bg-primary hover:bg-primary/90"
                  disabled={mfaCode.length !== 6 || isLoading}
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
                      Verifying...
                    </span>
                  ) : (
                    'Verify & Sign In'
                  )}
                </Button>
                
                <Button 
                  type="button" 
                  variant="outline" 
                  className="w-full"
                  onClick={() => {
                    setStep('credentials');
                    setMfaCode('');
                    setError('');
                  }}
                >
                  Back to Login
                </Button>
              </div>
            </form>
          )}

          <Separator className="my-6" />
          
          <div className="text-center text-xs text-muted-foreground">
            <p>Protected by Microsoft Authenticator two-factor authentication</p>
            <p className="mt-1">ReviseTax Admin Portal &copy; 2025</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 