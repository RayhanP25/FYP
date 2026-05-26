import { useRoutes, Navigate } from 'react-router-dom';
import type { RouteObject } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import HomePage from '../pages/Home';
import Login from '../pages/Login';
import NotFound from '../pages/notFound';
import ViewUserPage from '../pages/viewUser';
import UserProfilePage from '../pages/userProfile';
import VideoTest from '../pages/videoTest';
// 1. Add the import for your new Camera Capture page
import CameraCapture from '../pages/CameraCapture'; 
import type { JSX } from 'react';

const PrivateRoute = ({ element }: { element: JSX.Element }) => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated() ? element : <Navigate to="/login" />;
};

const PublicRoute = ({ element }: { element: JSX.Element }) => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated() ? <Navigate to="/video-test" /> : element;
};

const AppRoutes = () => {
  const { isAuthenticated } = useAuth();

  const allRoutes: RouteObject[] = [
    {
      path: '/',
      element: <Navigate to={isAuthenticated() ? "/home" : "/login"} replace />
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
      element: <PrivateRoute element={<ViewUserPage />} />,
    },
    {
      path: '/user-profile',
      element: <PrivateRoute element={<UserProfilePage />} />,
    },
    {
      path: '/video-test',
      element: <PrivateRoute element={<VideoTest />} />,
    },
    // 2. Register the new route as a PrivateRoute
    {
      path: '/camera-capture',
      element: <PrivateRoute element={<CameraCapture />} />,
    },
    {
      path: '/*',
      element: <NotFound />,
    },
  ];

  return useRoutes(allRoutes);
};

export default AppRoutes;