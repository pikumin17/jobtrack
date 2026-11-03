import { createBrowserRouter, type RouteObject } from 'react-router'
import { AdminPage } from '@/features/admin/AdminPage'
import { AnalyticsPage } from '@/features/analytics/AnalyticsPage'
import { AuthCallbackPage } from '@/features/auth/AuthCallbackPage'
import { RequireAdmin, RequireMember, RequireOnboarded } from '@/features/auth/guards'
import { LoginPage } from '@/features/auth/LoginPage'
import { NotInvitedPage } from '@/features/auth/NotInvitedPage'
import { CalendarPage } from '@/features/calendar/CalendarPage'
import { CompaniesPage } from '@/features/companies/CompaniesPage'
import { CompanyDetailPage } from '@/features/companies/CompanyDetailPage'
import { HomePage } from '@/features/home/HomePage'
import { MorePage } from '@/features/placeholders/MorePage'
import { NotFoundPage } from '@/features/placeholders/NotFoundPage'
import { DataPage } from '@/features/settings/DataPage'
import { OnboardingPage, ProfilePage } from '@/features/settings/ProfilePages'
import { TrashPage } from '@/features/trash/TrashPage'
import { AppShell } from './AppShell'

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/auth/callback', element: <AuthCallbackPage /> },
  { path: '/not-invited', element: <NotInvitedPage /> },
  {
    path: '/onboarding',
    element: (
      <RequireMember>
        <OnboardingPage />
      </RequireMember>
    ),
  },
  {
    element: (
      <RequireMember>
        <RequireOnboarded>
          <AppShell />
        </RequireOnboarded>
      </RequireMember>
    ),
    children: [
      { index: true, element: <HomePage /> },
      { path: 'companies', element: <CompaniesPage /> },
      { path: 'companies/:id', element: <CompanyDetailPage /> },
      { path: 'calendar', element: <CalendarPage /> },
      { path: 'analytics', element: <AnalyticsPage /> },
      { path: 'more', element: <MorePage /> },
      { path: 'more/trash', element: <TrashPage /> },
      { path: 'more/profile', element: <ProfilePage /> },
      { path: 'more/data', element: <DataPage /> },
      {
        path: 'more/admin',
        element: (
          <RequireAdmin>
            <AdminPage />
          </RequireAdmin>
        ),
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]

export const router = createBrowserRouter(routes)
