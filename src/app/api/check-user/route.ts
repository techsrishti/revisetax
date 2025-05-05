import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const { phoneNumber } = await request.json();
    
    const user = await prisma.user.findUnique({
      where: {
        phoneNumber,
      },
    });

    return NextResponse.json(!!user);
  } catch (error) {
    console.error('Error checking user:', error);
    return NextResponse.json(false);
  }
}