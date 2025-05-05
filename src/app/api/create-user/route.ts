import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const { name, email, phoneNumber } = await request.json();

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: {
        phoneNumber,
      },
    });

    if (existingUser) {
      return NextResponse.json({ message: 'User already exists' }, { status: 400 });
    }

    // Create new user
    const user = await prisma.user.create({
      data: {
        name,
        email,
        phoneNumber,
      },
    });

    return NextResponse.json(user);
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json(
      { message: 'Failed to create user' },
      { status: 500 }
    );
  }
}