import { randomUUID } from "node:crypto";
import type { AuthUser, PublicUser, Role } from "./types";
import { hashPassword, verifyPassword } from "./password";
import { ROLES } from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

function toPublic(user: AuthUser): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    active: user.active,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

export class UserStore {
  private readonly byId = new Map<string, AuthUser>();
  private readonly byEmail = new Map<string, string>();

  async seedDefaults(users: Array<{ email: string; password: string; displayName: string; role: Role }>): Promise<void> {
    for (const seed of users) {
      const normalized = seed.email.trim().toLowerCase();
      if (this.byEmail.has(normalized)) continue;
      await this.create({
        email: normalized,
        password: seed.password,
        displayName: seed.displayName,
        role: seed.role
      });
    }
  }

  async create(input: {
    email: string;
    password: string;
    displayName: string;
    role: Role;
    active?: boolean;
  }): Promise<PublicUser> {
    const email = input.email.trim().toLowerCase();
    if (this.byEmail.has(email)) {
      throw new Error("User already exists");
    }
    if (!ROLES.includes(input.role) || input.role === "service") {
      throw new Error("Invalid role for user account");
    }

    const now = nowIso();
    const user: AuthUser = {
      id: randomUUID(),
      email,
      displayName: input.displayName.trim().slice(0, 128),
      role: input.role,
      active: input.active ?? true,
      passwordHash: await hashPassword(input.password),
      createdAt: now,
      updatedAt: now
    };

    this.byId.set(user.id, user);
    this.byEmail.set(email, user.id);
    return toPublic(user);
  }

  getById(id: string): PublicUser | undefined {
    const user = this.byId.get(id);
    return user ? toPublic(user) : undefined;
  }

  getByEmail(email: string): PublicUser | undefined {
    const id = this.byEmail.get(email.trim().toLowerCase());
    return id ? this.getById(id) : undefined;
  }

  list(): PublicUser[] {
    return [...this.byId.values()].map(toPublic);
  }

  async verifyCredentials(email: string, password: string): Promise<PublicUser | null> {
    const id = this.byEmail.get(email.trim().toLowerCase());
    if (!id) return null;
    const user = this.byId.get(id);
    if (!user || !user.active) return null;
    const ok = await verifyPassword(password, user.passwordHash);
    return ok ? toPublic(user) : null;
  }

  async update(
    id: string,
    patch: Partial<Pick<AuthUser, "displayName" | "role" | "active">> & { password?: string }
  ): Promise<PublicUser | undefined> {
    const user = this.byId.get(id);
    if (!user) return undefined;

    if (patch.displayName !== undefined) user.displayName = patch.displayName.trim().slice(0, 128);
    if (patch.role !== undefined) {
      if (!ROLES.includes(patch.role) || patch.role === "service") {
        throw new Error("Invalid role");
      }
      user.role = patch.role;
    }
    if (patch.active !== undefined) user.active = patch.active;
    if (patch.password !== undefined) {
      user.passwordHash = await hashPassword(patch.password);
    }
    user.updatedAt = nowIso();
    this.byId.set(id, user);
    return toPublic(user);
  }
}

export const userStore = new UserStore();
