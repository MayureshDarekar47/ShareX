import { Routes, Route, Navigate } from 'react-router-dom';
import { useApp } from './context/AppContext';
import Navbar from './components/Navbar';
import PairingPage from './pages/PairingPage';
import DashboardPage from './pages/DashboardPage';
import NameSetupPage from './pages/NameSetupPage';

export default function App() {
  const { sessionToken, isNameConfirmed } = useApp();

  return (
    <div className="app-layout">
      <Navbar />
      <main className="app-main">
        {!isNameConfirmed ? (
          <NameSetupPage />
        ) : (
          <Routes>
            <Route
              path="/"
              element={sessionToken ? <DashboardPage /> : <PairingPage />}
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}
      </main>
    </div>
  );
}
