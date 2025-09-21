import { useAuth } from "../context/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import { useState, useEffect } from "react";

export default function SignupPage() {
  const { signup, currentUser } = useAuth();
  const [error, setError] = useState("");
  const nav = useNavigate();

  // 🔥 Redirect if already signed in
  useEffect(() => {
    if (currentUser) {
      nav("/upload");
    }
  }, [currentUser, nav]);

  async function handleSignup() {
    try {
      setError("");
      await signup();
      nav("/upload"); // ✅ new user goes to upload
    } catch (e) {
      if (e.message.includes("already exists")) {
        setError("User already exists. Please login instead.");
      } else {
        setError(e.message);
      }
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-extrabold bg-gradient-to-r from-green-600 to-emerald-500 bg-clip-text text-transparent">
            Create Your Account
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Join Demystdocs-AI and simplify your legal documents instantly.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 rounded-md bg-red-100 text-red-700 text-sm">
            {error}
          </div>
        )}

        <button
          onClick={handleSignup}
          className="w-full flex items-center justify-center gap-3 bg-white border border-gray-300 text-gray-700 py-2.5 rounded-lg shadow-sm hover:bg-gray-100 transition dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600"
        >
          <img
            src="https://www.svgrepo.com/show/355037/google.svg"
            alt="Google"
            className="w-5 h-5"
          />
          <span className="font-medium">Sign up with Google</span>
        </button>

        <div className="flex items-center my-6">
          <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700"></div>
          <span className="px-3 text-xs text-gray-400 uppercase">or</span>
          <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700"></div>
        </div>

        <div className="text-sm text-gray-600 dark:text-gray-400 space-y-2 mb-6">
          <p>✔️ Upload & summarize contracts instantly.</p>
          <p>✔️ Get AI-powered risk analysis and explanations.</p>
          <p>✔️ Chat interactively with your documents.</p>
        </div>

        <p className="text-sm text-center text-gray-600 dark:text-gray-400">
          Already have an account?{" "}
          <Link
            to="/login"
            className="font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            Login here
          </Link>
        </p>
      </div>
    </div>
  );
}
