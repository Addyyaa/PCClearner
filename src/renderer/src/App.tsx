import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { AdsPage } from './routes/AdsPage'
import { DashboardPage } from './routes/DashboardPage'
import { DiskCleanerPage } from './routes/DiskCleanerPage'
import { DiskUsagePage } from './routes/DiskUsagePage'
import { DuplicateFilesPage } from './routes/DuplicateFilesPage'
import { MigrationPage } from './routes/MigrationPage'
import { NetworkPage } from './routes/NetworkPage'
import { RegistryPage } from './routes/RegistryPage'
import { ResidualPage } from './routes/ResidualPage'
import { SignaturePage } from './routes/SignaturePage'
import { StartupPage } from './routes/StartupPage'

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'disk-cleaner', element: <DiskCleanerPage /> },
      { path: 'disk-usage', element: <DiskUsagePage /> },
      { path: 'duplicates', element: <DuplicateFilesPage /> },
      { path: 'registry', element: <RegistryPage /> },
      { path: 'network', element: <NetworkPage /> },
      { path: 'startup', element: <StartupPage /> },
      { path: 'ads', element: <AdsPage /> },
      { path: 'signature', element: <SignaturePage /> },
      { path: 'residual', element: <ResidualPage /> },
      { path: 'migration', element: <MigrationPage /> }
    ]
  }
])

export function App() {
  return <RouterProvider router={router} />
}
