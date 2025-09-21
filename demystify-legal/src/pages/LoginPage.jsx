import { useAuth } from "../context/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import { useState, useEffect } from "react";

export default function LoginPage() {
  const { login, currentUser } = useAuth();
  const [error, setError] = useState("");
  const nav = useNavigate();

  // 🔥 Auto-redirect if already logged in
  useEffect(() => {
    if (currentUser) {
      nav("/upload");
    }
  }, [currentUser, nav]);

  async function handleLogin() {
    try {
      setError("");
      await login();
      nav("/upload"); // ✅ go to upload if login success
    } catch (e) {
      if (e.message.includes("not registered")) {
        setError("User not registered. Please sign up first.");
      } else {
        setError(e.message);
      }
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-extrabold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Welcome Back
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Login to access your documents
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 rounded-md bg-red-100 text-red-700 text-sm">
            {error}
          </div>
        )}

        <button
          onClick={handleLogin}
          className="w-full flex items-center justify-center gap-3 bg-white border border-gray-300 text-gray-700 py-2.5 rounded-lg shadow-sm hover:bg-gray-100 transition dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600"
        >
          <img
            src="https://www.svgrepo.com/show/355037/google.svg"
            alt="Google"
            className="w-5 h-5"
          />
          <span className="font-medium">Login with Google</span>
        </button>

        <div className="flex items-center my-6">
          <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700"></div>
          <span className="px-3 text-xs text-gray-400 uppercase">or</span>
          <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700"></div>
        </div>

        <p className="text-sm text-center text-gray-600 dark:text-gray-400">
          New here?{" "}
          <Link
            to="/signup"
            className="font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
