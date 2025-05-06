import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const plans = [
    {
      name: 'Professional',
      price: 1499.00,
      features: {
        'Form 16': true,
        'Other Income': true,
        'Tax Optimization': true,
        'Multi Form 16s': false,
        'Capital Gains': false,
        'Futures and Options': false,
        'Annual Income Above 50L': false,
      },
    },
    {
      name: 'Business',
      price: 4999.00,
      features: {
        'Form 16': true,
        'Other Income': true,
        'Tax Optimization': true,
        'Multi Form 16s': true,
        'Capital Gains': true,
        'Futures and Options': false,
        'Annual Income Above 50L': false,
      },
    },
    {
      name: 'Advanced',
      price: 9999.00,
      features: {
        'Form 16': true,
        'Other Income': true,
        'Tax Optimization': true,
        'Multi Form 16s': true,
        'Capital Gains': true,
        'Futures and Options': true,
        'Annual Income Above 50L': true,
      },
    },
  ]

  await prisma.plan.deleteMany()

  for (const plan of plans) {
    const created = await prisma.plan.create({
      data: {
        name: plan.name,
        price: plan.price,
        features: plan.features,
      },
    })
    console.log(`Inserted plan: ${created.name}`)
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
