import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ORG_NAME = "Tech Geeks IT Solution";
const DEFAULT_EMAIL = "admin@tgit.in";
const DEFAULT_PASSWORD_HASH = "CHANGE_ME_IN_PRODUCTION";

const DEFAULT_TAX_RATES = [
  { name: "GST 0%", rate: 0 },
  { name: "GST 5%", rate: 5 },
  { name: "GST 12%", rate: 12 },
  { name: "GST 18%", rate: 18 },
  { name: "GST 28%", rate: 28 },
];

const DEFAULT_UNITS = [
  { code: "NOS", name: "Numbers" },
  { code: "PCS", name: "Pieces" },
  { code: "SET", name: "Set" },
  { code: "BOX", name: "Box" },
  { code: "KG", name: "Kilogram" },
  { code: "MTR", name: "Metre" },
  { code: "SQF", name: "Square Feet" },
  { code: "HRS", name: "Hours" },
];

export async function ensureSeedData() {
  let org = await prisma.organization.findFirst();
  if (!org) {
    org = await prisma.organization.create({ data: { name: ORG_NAME } });
    console.log(`[seed] Created organization: ${org.name} (${org.id})`);
  }

  let user = await prisma.user.findFirst({ where: { organizationId: org.id } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        organizationId: org.id,
        email: DEFAULT_EMAIL,
        passwordHash: DEFAULT_PASSWORD_HASH,
        displayName: "Admin",
      },
    });
    console.log(`[seed] Created user: ${user.email} (${user.id})`);
  }

  for (const tr of DEFAULT_TAX_RATES) {
    await prisma.taxRate.upsert({
      where: { id: tr.name },
      update: {},
      create: { id: undefined, name: tr.name, rate: tr.rate },
    }).catch(() => {
      return prisma.taxRate.findFirst({ where: { name: tr.name } }).then(existing => {
        if (!existing) return prisma.taxRate.create({ data: { name: tr.name, rate: tr.rate } });
      });
    });
  }

  for (const u of DEFAULT_UNITS) {
    await prisma.unit.upsert({
      where: { code: u.code },
      update: {},
      create: { code: u.code, name: u.name },
    }).catch(() => {});
  }

  return { org, user };
}

if (process.argv[1] && process.argv[1].endsWith("seed.js")) {
  ensureSeedData()
    .then(() => { console.log("[seed] Done."); process.exit(0); })
    .catch((e) => { console.error("[seed] Error:", e); process.exit(1); })
    .finally(() => prisma.$disconnect());
}
