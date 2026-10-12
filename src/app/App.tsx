import { createBrowserRouter, RouterProvider } from 'react-router';
import { AppShell } from './AppShell';
import { useApplyTheme } from './useTheme';
import { DashboardPage } from '@/features/dashboard/DashboardPage';

// Pages beyond the first screen are code-split; the chart library only loads when needed.
const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'live', lazy: async () => ({ Component: (await import('@/features/live/LivePage')).LivePage }) },
      { path: 'dtc', lazy: async () => ({ Component: (await import('@/features/dtc/DtcPage')).DtcPage }) },
      { path: 'record', lazy: async () => ({ Component: (await import('@/features/record/RecordPage')).RecordPage }) },
      { path: 'vehicle', lazy: async () => ({ Component: (await import('@/features/vehicle/VehiclePage')).VehiclePage }) },
      { path: 'settings', lazy: async () => ({ Component: (await import('@/features/settings/SettingsPage')).SettingsPage }) },
      { path: '*', element: <DashboardPage /> },
    ],
  },
]);

export function App() {
  useApplyTheme();
  return <RouterProvider router={router} />;
}
