import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const { phoneNumber, email } = await request.json();
    
    console.log('Checking User Existence:', { phoneNumber, email });

    // Check for both phone number and email
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { phoneNumber: phoneNumber || undefined },
          { email: email || undefined }
        ]
       },
    });

    console.log('User Check Result:', { 
      exists: !!user,
      foundByPhone: user?.phoneNumber === phoneNumber,
      foundByEmail: user?.email === email
    });

    return NextResponse.json(!!user);
  } catch (error) {
    console.error('User Check Error:', error);
    return NextResponse.json(false);
  }
}