import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Super Admin (mandatory recovery account)
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL || 'superadmin@glee.com';
  const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD || 'ChangeMe@123!';
  const hash = await bcrypt.hash(superAdminPassword, 12);

  const superAdmin = await prisma.user.upsert({
    where: { email: superAdminEmail },
    update: {},
    create: {
      email: superAdminEmail,
      passwordHash: hash,
      firstName: 'Super',
      lastName: 'Admin',
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      isEmailVerified: true,
    },
  });
  console.log(`✅ Super Admin: ${superAdmin.email}`);

  // Demo Vendor user
  const vendorEmail = 'vendor@glee.com';
  const vendorHash = await bcrypt.hash('Vendor@123!', 12);
  const vendorUser = await prisma.user.upsert({
    where: { email: vendorEmail },
    update: {},
    create: {
      email: vendorEmail,
      passwordHash: vendorHash,
      firstName: 'Demo',
      lastName: 'Vendor',
      role: UserRole.VENDOR,
      isActive: true,
      isEmailVerified: true,
    },
  });

  const vendor = await prisma.vendor.upsert({
    where: { userId: vendorUser.id },
    update: {},
    create: {
      userId: vendorUser.id,
      businessName: 'Neon Nights Ltd',
      contactEmail: vendorEmail,
      isApproved: true,
      approvedAt: new Date(),
      approvedById: superAdmin.id,
    },
  });
  console.log(`✅ Demo Vendor: ${vendorEmail}`);

  // Demo Venue
  const venue = await prisma.venue.upsert({
    where: { slug: 'neon-nights-london' },
    update: {},
    create: {
      vendorId: vendor.id,
      name: 'Neon Nights London',
      slug: 'neon-nights-london',
      description: 'Premier nightclub in the heart of London',
      address: '1 Club Street',
      city: 'London',
      country: 'GB',
      phone: '+44 20 0000 0000',
      status: 'LIVE',
      depositRequired: true,
      depositPercent: 25,
      serviceChargePercent: 12.5,
      taxPercent: 20,
      openingHours: {
        fri: { open: '21:00', close: '04:00' },
        sat: { open: '21:00', close: '04:00' },
      },
    },
  });
  console.log(`✅ Demo Venue: ${venue.name}`);

  // Tables
  const [table1, table2] = await Promise.all([
    prisma.table.upsert({
      where: { id: 'demo-table-001' },
      update: {},
      create: {
        id: 'demo-table-001',
        venueId: venue.id,
        name: 'Table 1 — Main Floor',
        capacity: 6,
        location: 'Main Floor',
        minimumSpend: 200,
      },
    }),
    prisma.table.upsert({
      where: { id: 'demo-table-002' },
      update: {},
      create: {
        id: 'demo-table-002',
        venueId: venue.id,
        name: 'VIP Booth A',
        capacity: 8,
        location: 'VIP Section',
        isVip: true,
        minimumSpend: 500,
        attributes: { bottleService: true, privateSecurity: true },
      },
    }),
  ]);
  console.log('✅ Demo Tables created');

  // Menu categories
  const categories = ['Whisky', 'Vodka', 'Champagne', 'Gin', 'Cocktails', 'Mixers', 'Food', 'Packages'];
  for (const name of categories) {
    await prisma.menuCategory.upsert({
      where: { venueId_slug: { venueId: venue.id, slug: name.toLowerCase() } },
      update: {},
      create: {
        venueId: venue.id,
        name,
        slug: name.toLowerCase(),
        sortOrder: categories.indexOf(name),
      },
    });
  }
  console.log('✅ Demo Menu Categories created');

  console.log('\n🎉 Seed complete!');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
