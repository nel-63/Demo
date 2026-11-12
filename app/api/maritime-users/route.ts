import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { validatePassword } from "@/lib/password-policy";
import { MARITIME_USERS_PAGE_SIZE, resolvePage } from "@/lib/pagination";

export async function GET(request: Request) {
  const admin = await getCurrentUser();
  if (!admin) return NextResponse.json({ message: "Connexion requise." }, { status: 401 });
  if (admin.role !== "ADMIN") {
    return NextResponse.json({ message: "Seul un administrateur peut consulter les utilisateurs maritimes." }, { status: 403 });
  }

  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
    const pageValue = url.searchParams.get("page") ?? undefined;
    const where = q
      ? {
          OR: [
            { user: { firstName: { contains: q, mode: "insensitive" as const } } },
            { user: { lastName: { contains: q, mode: "insensitive" as const } } },
            { user: { email: { contains: q, mode: "insensitive" as const } } },
            { user: { phoneNumber: { contains: q, mode: "insensitive" as const } } },
            ...(q.toLocaleLowerCase("fr-FR") === "actif"
              ? [{ user: { isActive: true } }]
              : q.toLocaleLowerCase("fr-FR") === "inactif"
                ? [{ user: { isActive: false } }]
                : []),
          ],
        }
      : undefined;

    const total = await prisma.maritimeUser.count({ where });
    const { page, totalPages } = resolvePage(pageValue, total, MARITIME_USERS_PAGE_SIZE);
    const maritimeUsers = await prisma.maritimeUser.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * MARITIME_USERS_PAGE_SIZE,
      take: MARITIME_USERS_PAGE_SIZE,
      select: {
        id: true,
        _count: { select: { declarations: true } },
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            phoneNumber: true,
            isActive: true,
          },
        },
      },
    });

    return NextResponse.json({
      maritimeUsers,
      pagination: { page, totalPages, total },
    });
  } catch (error) {
    console.error("Maritime user list failed:", error);
    return NextResponse.json({ message: "Impossible de charger les utilisateurs maritimes." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const admin = await getCurrentUser();
  if (!admin) return NextResponse.json({ message: "Connexion requise." }, { status: 401 });
  if (admin.role !== "ADMIN") {
    return NextResponse.json({ message: "Seul un administrateur peut enregistrer un utilisateur maritime." }, { status: 403 });
  }

  try {
    const body: unknown = await request.json().catch(() => null);
    const data = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const text = (key: string) => typeof data[key] === "string" ? (data[key] as string).trim() : "";
    const companyName = text("companyName");
    const firstName = companyName;
    const lastName = "Compte maritime";
    const email = text("email").toLowerCase();
    const password = typeof data.password === "string" ? data.password : "";

    if (!companyName || companyName.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ message: "Le nom de la société et un identifiant email valide sont obligatoires." }, { status: 400 });
    }

    const passwordError = validatePassword(password);
    if (passwordError) return NextResponse.json({ message: passwordError }, { status: 400 });

    const passwordHash = await bcrypt.hash(password, 12);
    const maritimeUser = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          firstName,
          lastName,
          email,
          passwordHash,
          role: "USER_MAR",
          designation: "Utilisateur maritime",
        },
        select: { id: true },
      });

      const createdProfile = await tx.maritimeUser.create({
        data: {
          userId: createdUser.id,
          companyName,
        },
        select: {
          id: true,
          latitude: true,
          longitude: true,
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              isActive: true,
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: admin.id,
          action: "CREATE",
          entityType: "MaritimeUser",
          entityId: createdProfile.id,
          details: {
            email,
          },
        },
      });

      return createdProfile;
    });

    return NextResponse.json({ ok: true, maritimeUser }, { status: 201 });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: string }).code
      : undefined;

    if (code === "P2002") {
      return NextResponse.json({ message: "Cet email ou cette CIN existe déjà." }, { status: 409 });
    }

    console.error("Maritime user creation failed:", error);
    return NextResponse.json({ message: "Impossible de créer l'utilisateur maritime." }, { status: 500 });
  }
}
