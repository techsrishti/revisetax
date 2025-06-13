'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Eye, EyeOff, Shield, Smartphone, AlertCircle, CheckCircle } from 'lucide-react';

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

  const supabase = createClientComponentClient();
  const router = useRouter();

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) throw signInError;

      // Check if MFA is required
      const { data: aalData, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      
      if (aalError) throw aalError;

      if (aalData.nextLevel === 'aal2' && aalData.nextLevel !== aalData.currentLevel) {
        // User needs to verify MFA
        const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
        if (factorsError) throw factorsError;

        const totpFactor = factorsData.totp[0];
        if (!totpFactor) throw new Error('No TOTP factors found');

        const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
          factorId: totpFactor.id
        });
        if (challengeError) throw challengeError;

        setFactorId(totpFactor.id);
        setChallengeId(challengeData.id);
        setStep('mfa');
      } else if (aalData.currentLevel === 'aal1') {
        // Check for existing unverified factors
        const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
        if (factorsError) throw factorsError;

        // If there are unverified factors, unenroll them first
        if (factorsData.totp && factorsData.totp.length > 0) {
          for (const factor of factorsData.totp) {
            await supabase.auth.mfa.unenroll({ factorId: factor.id });
          }
        }

        // Now proceed with new enrollment
        const { data: enrollData, error: enrollError } = await supabase.auth.mfa.enroll({
          factorType: 'totp'
        });
        if (enrollError) throw enrollError;

        setIsSettingUpMFA(true);
        setMfaSetupStep('qr');
        setQrCodeUrl(enrollData.totp.qr_code);
        setFactorId(enrollData.id);
      } else {
        // User is fully authenticated
        router.push('/admin/dashboard');
      }
    } catch (error) {
      console.error('Login error:', error);
      setError(error instanceof Error ? error.message : 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMFASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId,
        code: mfaCode
      });

      if (verifyError) throw verifyError;

      // Success - redirect to dashboard
      router.push('/admin/dashboard');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'MFA verification failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMFASetupVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId,
        code: mfaCode
      });

      if (verifyError) throw verifyError;

      // MFA setup successful - redirect to dashboard
      router.push('/admin/dashboard');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'MFA setup verification failed');
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
      setIsSettingUpMFA(false);
      setMfaSetupStep(null);
      setQrCodeUrl('');
      setFactorId('');
      setMfaCode('');
      setError('');
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
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
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
                disabled={isLoading}
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
                    Signing in...
                  </span>
                ) : (
                  'Sign In'
                )}
              </Button>
            </form>
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
            <p className="mt-1">ReviseTax Admin Portal &copy; 2024</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 