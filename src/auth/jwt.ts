import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env";
import type { AuthPrincipal, JwtClaims, Role } from "./types";

export function signAccessToken(input: {
  id: string;
  email: string;
  displayName: string;
  role: Role;
}): string {
  const secret = env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }

  const claims: JwtClaims = {
    sub: input.id,
    email: input.email,
    displayName: input.displayName,
    role: input.role
  };

  const options: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
    issuer: env.JWT_ISSUER,
    algorithm: "HS256"
  };
  return jwt.sign(claims, secret, options);
}

export function verifyAccessToken(token: string): AuthPrincipal | null {
  const secret = env.JWT_SECRET;
  if (!secret) return null;

  try {
    const decoded = jwt.verify(token, secret, {
      algorithms: ["HS256"],
      issuer: env.JWT_ISSUER
    }) as JwtClaims;

    if (!decoded.sub || !decoded.email || !decoded.role) return null;

    return {
      id: decoded.sub,
      email: decoded.email,
      displayName: decoded.displayName ?? decoded.email,
      role: decoded.role,
      authMethod: "jwt"
    };
  } catch {
    return null;
  }
}

/** JWT tokens contain two dots; API keys typically do not. */
export function looksLikeJwt(token: string): boolean {
  return token.split(".").length === 3;
}
