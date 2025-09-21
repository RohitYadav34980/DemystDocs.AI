import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Header() {
  const { user, logout } = useAuth();

  return (
    <header className="w-full bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-700 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
        {/* Logo */}
        <Link
          to="/"
          className="font-extrabold text-xl bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent hover:opacity-80 transition"
        >
          Demystdocs-AI
        </Link>

        {/* Navigation */}
        <nav className="flex items-center gap-6">
          {user && (
            <Link
              to="/upload"
              className="text-sm text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition"
            >
              Upload
            </Link>
          )}

          {user ? (
            <div className="flex items-center gap-3">
              {user.photo ? (
                <img
                  src={user.photo}
                  alt="profile"
                  className="w-9 h-9 rounded-full border border-gray-300 dark:border-gray-600 object-cover"
                />
              ) : (
                <div className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-300 dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-medium text-sm">
                  {user.name?.[0]?.toUpperCase()}
                </div>
              )}
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {user.name}
              </span>
              <button
                onClick={logout}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-red-500 hover:bg-red-600 transition shadow-sm"
              >
                Logout
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Link
                to="/login"
                className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition"
              >
                Login
              </Link>
              <Link
                to="/signup"
                className="px-4 py-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg shadow-sm transition"
              >
                Sign Up
              </Link>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
