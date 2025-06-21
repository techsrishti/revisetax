import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { token } = await request.json();

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'reCAPTCHA token is required' },
        { status: 400 }
      );
    }

    const secretKey = process.env.RECAPTCHA_SECRET_KEY;
    if (!secretKey) {
      console.error('RECAPTCHA_SECRET_KEY is not configured');
      return NextResponse.json(
        { success: false, error: 'reCAPTCHA not configured' },
        { status: 500 }
      );
    }

    // Verify the token with Google's reCAPTCHA API
    const verificationUrl = 'https://www.google.com/recaptcha/api/siteverify';
    const response = await fetch(verificationUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        secret: secretKey,
        response: token,
        remoteip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '',
      }),
    });

    const verificationResult = await response.json();

    if (verificationResult.success) {
      return NextResponse.json({ 
        success: true,
        score: verificationResult.score // For reCAPTCHA v3
      });
    } else {
      return NextResponse.json({ 
        success: false, 
        error: 'reCAPTCHA verification failed',
        'error-codes': verificationResult['error-codes']
      }, { status: 400 });
    }

  } catch (error) {
    console.error('reCAPTCHA verification error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
} 