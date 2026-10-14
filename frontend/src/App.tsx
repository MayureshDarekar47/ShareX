import { Routes, Route, Navigate } from 'react-router-dom';
import { useApp } from './context/AppContext';
import Navbar from './components/Navbar';
import DashboardPage from './pages/DashboardPage';
import NameSetupPage from './pages/NameSetupPage';

export default function App() {
  const { isNameConfirmed } = useApp();

  return (
    <div className="app-layout">
      <Navbar />
      <main className="app-main">
        {!isNameConfirmed ? (
          <NameSetupPage />
        ) : (
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}
      </main>
    </div>
  );
}
