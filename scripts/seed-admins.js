import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedAdmins() {
  try {
    console.log('🌱 Seeding admin data...');

    // Create initial admins
    const admins = [
      {
        id: 'admin-1',
        name: 'John Admin',
        email: 'admin@revisetax.com',
        isActive: true,
        maxChats: 5,
      },
      {
        id: 'admin-2', 
        name: 'Sarah Support',
        email: 'sarah@revisetax.com',
        isActive: true,
        maxChats: 3,
      },
      {
        id: 'admin-3',
        name: 'Mike Manager',
        email: 'mike@revisetax.com',
        isActive: true,
        maxChats: 4,
      }
    ];

    for (const adminData of admins) {
      const existingAdmin = await prisma.admin.findUnique({
        where: { email: adminData.email }
      });

      if (existingAdmin) {
        console.log(`✅ Admin ${adminData.name} already exists`);
        continue;
      }

      const admin = await prisma.admin.create({
        data: adminData
      });

      console.log(`✅ Created admin: ${admin.name} (${admin.email})`);
    }

    console.log('🎉 Admin seeding completed!');
  } catch (error) {
    console.error('❌ Error seeding admins:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the seed function
seedAdmins()
  .then(() => {
    console.log('✅ Seed script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Seed script failed:', error);
    process.exit(1);
  }); 