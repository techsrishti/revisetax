import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: Request) {
  try {
    const { supabaseUserId, name, email, phoneNumber, provider, providerId } = await request.json();

    console.log("Supabase user ID: ", supabaseUserId)

    // Validate required fields
    if (!phoneNumber) {
      return NextResponse.json(
        { message: 'Phone number is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient()
    const { data: { user: supabaseUser } } = await supabase.auth.getUser()
    if (!supabaseUser) {
      return NextResponse.json(
        { message: 'User not found' },
        { status: 400 }
      );
    }

    console.log("Supabase user: ", supabaseUser)

    if (supabaseUser.id !== supabaseUserId) {
      console.log("Supabase user ID does not match the one provided in the request.")
      return NextResponse.json(
        { message: 'User not found' },
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

    // Prepare data for new user
    const userData: any = {
      supabaseUserId,
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

    // Create new user
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