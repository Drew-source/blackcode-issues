import { withAuth } from 'next-auth/middleware'

export default withAuth({
  pages: {
    signIn: '/login',
  },
})

// Protect these routes
export const config = {
  matcher: ['/dashboard/:path*', '/api/projects/:path*', '/api/issues/:path*', '/api/undo/:path*'],
}

