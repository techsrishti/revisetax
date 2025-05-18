// cachePlansToRedis.ts
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

const prisma = new PrismaClient();
const redis = new Redis(); // Defaults to localhost:6379

async function cachePlansToRedis() {
  try {
    const plans = await prisma.plan.findMany({
      select: {
        id: true,
        name: true,
        price: true,
        features: true,
      },
    });

    const mappedPlans = plans.map(plan => ({
      id: plan.id,
      name: plan.name,
      price: plan.price.toNumber(),
      features: plan.features as Record<string, boolean>,
    }));

    const cacheKey = 'plans:all';

    // Optional: delete old cache
    await redis.del(cacheKey);

    // Cache for 7 days (604800 seconds)
    await redis.set(cacheKey, JSON.stringify(mappedPlans), 'EX', 604800);

    console.log('✅ Plans cached to Redis for 7 days under key:', cacheKey);
  } catch (err) {
    console.error('❌ Failed to cache plans to Redis:', err);
  } finally {
    await prisma.$disconnect();
    await redis.quit();
  }
}

cachePlansToRedis();
