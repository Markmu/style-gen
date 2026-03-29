import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string; // ULID userId
      email: string;
      name: string;
      image?: string | null;
      avatarUrl: string | null;
    };
  }
}
