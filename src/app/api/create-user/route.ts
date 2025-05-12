import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const { name, email, phoneNumber, provider, providerId } = await request.json();

    // Validate required fields
    if (!phoneNumber) {
      return NextResponse.json(
        { message: 'Phone number is required' },
        { status: 400 }
      );
    }

    // Check if user already exists by phone number or email
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { phoneNumber },
          { email: email || undefined }
        ]
      },
    });

    if (existingUser) {
      // If user exists, update their information
      const updateData: any = {
        updatedAt: new Date(),
      };
      
      // Update name if provided
      if (name) {
        updateData.name = name;
      }

      // Update email if provided and different
      if (email && email !== existingUser.email) {
        updateData.email = email;
      }
      
      // Update social info if provided
      if (provider && providerId) {
        updateData.provider = provider;
        updateData.providerId = providerId;
      }
      
      const updatedUser = await prisma.user.update({
        where: {
          id: existingUser.id
        },
        data: updateData,
      });
      return NextResponse.json(updatedUser);
    }

    // Create new user with all provided information
    const userData: any = {
      name,
      phoneNumber,
    };

    // Add email if provided
    if (email) {
      userData.email = email;
    }

    // Add social info if provided
    if (provider && providerId) {
      userData.provider = provider;
      userData.providerId = providerId;
    }

    const user = await prisma.user.create({
      data: userData,
    });
    return NextResponse.json(user);
  } catch (error) {
    console.error('Error creating/updating user:', error);
    return NextResponse.json(
      { message: 'Failed to create/update user' },
      { status: 500 }
    );
  }
}