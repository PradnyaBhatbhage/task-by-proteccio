import type { AuthPrincipal } from "../auth/types";

declare global {
  namespace Express {
    interface Request {
      user?: AuthPrincipal;
    }
  }
}

export {};
