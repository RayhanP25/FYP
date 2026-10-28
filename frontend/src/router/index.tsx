import { useRoutes, Navigate, useParams } from 'react-router-dom';
import type { RouteObject } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import HomePage from '../pages/Home';
import Login from '../pages/Login';
import NotFound from '../pages/notFound';
import ViewUserPage from '../pages/viewUser';
import UserProfilePage from '../pages/userProfile';
// import VideoTest from '../pages/videoTest';
import type { JSX } from 'react';
import CameraCapture from '../pages/CameraCapture';
import VideosPage from '../pages/VideosPage';
import AnalysisLibraryPage from '../pages/AnalysisLibraryPage';
import AnalysisStudioPage from '../pages/AnalysisStudioPage';
import CalibrationPage from '../pages/CalibrationPage';
import GroupsPage from '../pages/GroupsPage';
import SettingsPage from '../pages/SettingsPage';

const AuthLoading = () => (
  <div className="flex h-screen items-center justify-center bg-background text-text-secondary">
    Loading...
  </div>
);

const PrivateRoute = ({ element }: { element: JSX.Element }) => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <AuthLoading />;
  return isAuthenticated() ? element : <Navigate to="/login" />;
};

const AdminRoute = ({ element }: { element: JSX.Element }) => {
  const { isAuthenticated, user, loading } = useAuth();
  if (loading) return <AuthLoading />;
  if (!isAuthenticated()) return <Navigate to="/login" />;
  if (user?.role !== 'admin') return <Navigate to="/home" />;
  return element;
};

const PublicRoute = ({ element }: { element: JSX.Element }) => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <AuthLoading />;
  return isAuthenticated() ? <Navigate to="/video-test" /> : element;
};

// The old analysis page's links (/kinematic-analysis/...) now open the analysis studio.
const ToStudio = () => {
  const { videoId } = useParams();
  return <Navigate to={videoId ? `/analysis/${videoId}` : '/analysis'} replace />;
};

const AppRoutes = () => {
  const { isAuthenticated, loading } = useAuth();

  const allRoutes: RouteObject[] = [
    {
      path: '/',
      element: loading
        ? <AuthLoading />
        : <Navigate to={isAuthenticated() ? "/home" : "/login"} replace />
    },
    {
      path: '/login',
      element: <PublicRoute element={<Login />} />,
    },
    {
      path: '/home',
      element: <PrivateRoute element={<HomePage />} />,
    },
    {
      path: '/view-users',
      element: <AdminRoute element={<ViewUserPage />} />,
    },
    {
      path: '/user-profile',
      element: <PrivateRoute element={<UserProfilePage />} />,
    },
    {
      path: '/settings',
      element: <PrivateRoute element={<SettingsPage />} />,
    },
    {
      path: '/camera-capture',
      element: <PrivateRoute element={<CameraCapture />} />,
    },
    {
      path: '/calibration',
      element: <AdminRoute element={<CalibrationPage />} />,
    },
    {
      path: '/groups',
      element: <PrivateRoute element={<GroupsPage />} />,
    },
    // {
    //   path: '/video-test',
    //   element: <PrivateRoute element={<VideoTest />} />,
    // },
    // {
    //   path: '/kinematic-analysis',
    //   element: <PrivateRoute element={<VideoTest />} />,
    // },
    {
      path: '*',
      element: <NotFound />
    },
    {
      path: '/video-test',
      element: <PrivateRoute element={<VideosPage />} />,
    },
    {
      path: '/analysis',
      element: <PrivateRoute element={<AnalysisLibraryPage />} />,
    },
    {
      path: '/analysis/:videoId',
      element: <PrivateRoute element={<AnalysisStudioPage />} />,
    },
    {
      // Old links to the previous analysis page
      path: '/kinematic-analysis/:videoId',
      element: <ToStudio />,
    },
    {
      path: '/kinematic-analysis',
      element: <ToStudio />,
    },
  ];

  return useRoutes(allRoutes);
};

export default AppRoutes;