import NextAuth, { type NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { neon } from '@neondatabase/serverless'

const neonSql = neon(process.env.DATABASE_URL!)

// Wrapper to return { rows } like @vercel/postgres
const sql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
  const rows = await neonSql(strings, ...values)
  return { rows }
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (!user.email) return false
      
      // Upsert user to database
      try {
        await sql`
          INSERT INTO users (google_id, email, name, avatar_url, last_login)
          VALUES (${account?.providerAccountId}, ${user.email}, ${user.name}, ${user.image}, NOW())
          ON CONFLICT (email) DO UPDATE SET
            name = EXCLUDED.name,
            avatar_url = EXCLUDED.avatar_url,
            last_login = NOW()
        `
      } catch (error) {
        console.error('Failed to upsert user:', error)
        // Don't block sign-in if DB insert fails
      }
      
      return true
    },
    async session({ session, token }) {
      if (session.user) {
        // Add user ID to session
        try {
          const result = await sql`
            SELECT id, role FROM users WHERE email = ${session.user.email}
          `
          if (result.rows[0]) {
            session.user.id = result.rows[0].id
            session.user.role = result.rows[0].role
          }
        } catch (error) {
          console.error('Failed to fetch user:', error)
        }
      }
      return session
    },
    async jwt({ token, user, account }) {
      if (account && user) {
        token.accessToken = account.access_token
        token.id = user.id
      }
      return token
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: 'jwt',
  },
}

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }

