import { PrismaClient } from "@prisma/client";
import { getCurrentFinancialYear } from "./lib/utils.js";

const FY_KEY = "activeFinancialYear";

export const prisma = new PrismaClient();

export async function getOrCreateOrgAndUser() {
  let org = await prisma.organization.findFirst();
  if (!org) {
    const { ensureSeedData } = await import("./seed.js");
    const result = await ensureSeedData();
    return { org: result.org, user: result.user };
  }
  let user = await prisma.user.findFirst({ where: { organizationId: org.id } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        organizationId: org.id,
        email: "admin@tgit.in",
        passwordHash: "CHANGE_ME_IN_PRODUCTION",
        displayName: "Admin",
      },
    });
  }
  return { org, user };
}

export async function getActiveFinancialYear(organizationId) {
  const setting = await prisma.setting.findUnique({
    where: { organizationId_key: { organizationId, key: FY_KEY } },
  });
  return setting?.value || getCurrentFinancialYear();
}
