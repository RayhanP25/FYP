import { useRoutes, Navigate } from 'react-router-dom';
import type { RouteObject } from 'react-router-dom';
import { isLogin } from '../hooks/auth';
import HomePage from '../pages/Home';
import Login from '../pages/Login';
import NotFound from '../pages/notFound';
import ViewUserPage from '../pages/viewUser';
import UserProfilePage from '../pages/userProfile';
import VideoTest from '../pages/videoTest';
import type { JSX } from 'react';

const PrivateRoute = ({ element }: { element: JSX.Element }) => {
  return isLogin() ? element : <Navigate to="/login" />;
};

const PublicRoute = ({ element }: { element: JSX.Element }) => {
  return isLogin() ? <Navigate to="/home" /> : element;
};

const allRoutes: RouteObject[] = [
  {
    path: '/',
    element: <Navigate to={isLogin() ? "/home" : "/login"} replace />
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
  {
    path: '/*',
    element: <NotFound />,
  },
];

export default function Router() {
  const route = useRoutes(allRoutes);
  return route;
}
