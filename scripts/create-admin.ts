import "dotenv/config";
import bcrypt from "bcryptjs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { prisma } from "../lib/prisma";

async function main() {
  const rl = createInterface({ input: stdin, output: stdout });

  try {
    console.log("=== Creation du premier administrateur ===");

    const firstName = (await rl.question("Prenom : ")).trim();
    const lastName = (await rl.question("Nom : ")).trim();
    const email = (await rl.question("Email : ")).trim().toLowerCase();
    const phoneNumber = (await rl.question("Telephone (facultatif) : ")).trim();
    const password = process.env.ADMIN_PASSWORD;

    if (!firstName || !lastName || !email.includes("@")) {
      throw new Error("Prenom, nom ou email invalide.");
    }

    if (!password || password.length < 12) {
      throw new Error("Le mot de passe administrateur doit contenir au moins 12 caracteres.");
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new Error("Un utilisateur avec cet email existe deja.");
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        firstName,
        lastName,
        email,
        phoneNumber: phoneNumber || null,
        passwordHash,
        role: "ADMIN",
        designation: "System Administrator",
      },
      select: { id: true, email: true, role: true },
    });

    console.log("Administrateur cree avec succes.");
    console.log(`Email : ${user.email}`);
    console.log(`Role : ${user.role}`);
    console.log("Le mot de passe n'a pas ete affiche.");
  } finally {
    rl.close();
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Erreur :", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
