import { createBrowserRouter, type RouteObject } from 'react-router'
import { AdminPage } from '@/features/admin/AdminPage'
import { AuthCallbackPage } from '@/features/auth/AuthCallbackPage'
import { RequireAdmin, RequireMember } from '@/features/auth/guards'
import { LoginPage } from '@/features/auth/LoginPage'
import { NotInvitedPage } from '@/features/auth/NotInvitedPage'
import { CompaniesPage } from '@/features/companies/CompaniesPage'
import { HomePage } from '@/features/placeholders/HomePage'
import { MorePage } from '@/features/placeholders/MorePage'
import { NotFoundPage } from '@/features/placeholders/NotFoundPage'
import { PlaceholderPage } from '@/features/placeholders/PlaceholderPage'
import { AppShell } from './AppShell'

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/auth/callback', element: <AuthCallbackPage /> },
  { path: '/not-invited', element: <NotInvitedPage /> },
  {
    element: (
      <RequireMember>
        <AppShell />
      </RequireMember>
    ),
    children: [
      { index: true, element: <HomePage /> },
      { path: 'companies', element: <CompaniesPage /> },
      { path: 'calendar', element: <PlaceholderPage title="カレンダー" phase={3} /> },
      { path: 'analytics', element: <PlaceholderPage title="分析" phase={4} /> },
      { path: 'more', element: <MorePage /> },
      { path: 'more/admin', element: <RequireAdmin><AdminPage /></RequireAdmin> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]

export const router = createBrowserRouter(routes)
