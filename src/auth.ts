import NextAuth from "next-auth";
import authConfig from "@/auth.config";

/**
 * 动态导入 findOrCreateUser 以避免在 Edge Runtime（middleware）中
 * 静态加载 pg 模块导致崩溃。此函数仅在 signIn/jwt 回调中调用，
 * 这些回调运行在 Node.js runtime 的 API route handler 中。
 */
async function getFindOrCreateUser() {
  const { findOrCreateUser } = await import(
    "@/lib/repositories/user-repository"
  );
  return findOrCreateUser;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    async signIn({ account, profile }) {
      // 仅允许 Google 登录
      if (account?.provider !== "google" || !profile?.sub) {
        console.log(
          JSON.stringify({
            event: "auth_login_failed",
            timestamp: new Date().toISOString(),
            reason: "invalid_provider_or_profile",
          })
        );
        return false;
      }
      // 创建/更新用户记录
      const findOrCreateUser = await getFindOrCreateUser();
      const user = await findOrCreateUser({
        googleId: profile.sub,
        email: profile.email ?? "",
        name: profile.name ?? "",
        avatarUrl: (profile as { picture?: string }).picture ?? null,
      });
      console.log(
        JSON.stringify({
          event: "auth_login_success",
          timestamp: new Date().toISOString(),
          userId: user.id,
          email: profile.email,
        })
      );
      return true;
    },
    async jwt({ token, account, profile }) {
      // 首次登录时把 userId 写入 JWT
      if (account?.provider === "google" && profile?.sub) {
        const findOrCreateUser = await getFindOrCreateUser();
        const user = await findOrCreateUser({
          googleId: profile.sub,
          email: profile.email ?? "",
          name: profile.name ?? "",
          avatarUrl: (profile as { picture?: string }).picture ?? null,
        });
        token.userId = user.id;
        token.avatarUrl = user.avatarUrl;
      }
      return token;
    },
    async session({ session, token }) {
      // 将 userId 和 avatarUrl 暴露到前端 session
      if (token.userId) {
        session.user.id = token.userId as string;
      }
      if (token.avatarUrl !== undefined) {
        session.user.avatarUrl = token.avatarUrl as string | null;
      }
      return session;
    },
  },
});
