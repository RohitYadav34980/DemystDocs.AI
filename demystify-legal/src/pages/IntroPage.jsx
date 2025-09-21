import { Link } from "react-router-dom";
import Card from "../components/Card";
import { useAuth } from "../context/AuthContext";

export default function IntroPage() {
  const { user } = useAuth();

  return (
    <div className="max-w-6xl mx-auto px-6 py-20">
      {/* Hero */}
      <div className="text-center md:text-left">
        <h1 className="text-5xl md:text-6xl font-extrabold mb-6 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-500 bg-clip-text text-transparent leading-tight">
          Demystify Legal Documents
        </h1>

        <p className="text-lg text-gray-900 dark:text-gray-900 max-w-2xl mx-auto md:mx-0 mb-10">
          Upload contracts, policies, or legal documents and instantly get a
          clear summary, risk highlights, and an interactive AI assistant that
          answers your questions in context.
        </p>

        <div className="flex gap-4 justify-center md:justify-start">
          {user ? (
            <Link
              to="/upload"
              className="px-6 py-3 rounded-xl text-white font-semibold bg-blue-600 hover:bg-blue-700 shadow-lg transition"
            >
              Upload a document
            </Link>
          ) : (
            <>
              <Link
                to="/signup"
                className="px-6 py-3 rounded-xl text-white font-semibold bg-green-600 hover:bg-green-700 shadow-lg transition"
              >
                Sign up
              </Link>
              <Link
                to="/login"
                className="px-6 py-3 rounded-xl font-semibold border border-gray-300 dark:border-gray-900 text-gray-800 dark:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-gray-200 transition"
              >
                Login
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-20">
        <Card title="How it works">
          <ol className="list-decimal list-inside space-y-2 text-base text-gray-700 dark:text-gray-200">
            <li>Sign up with Google (first-time users).</li>
            <li>Log in after signup.</li>
            <li>Upload a PDF or DOCX file (OCR extracts the text).</li>
            <li>Select text to ask focused questions.</li>
            <li>See summaries, explanations & risk flags instantly.</li>
            <li>Chat with the assistant for deeper insights.</li>
          </ol>
        </Card>

        <Card title="Why this helps">
          <p className="text-base text-gray-700 dark:text-gray-200 leading-relaxed">
            Legal text is dense. Our interface makes it clear and interactive.
            Selection-driven queries cut through the clutter by sending only
            the relevant text to AI, while the side-by-side layout keeps the
            full context visible.
          </p>
        </Card>
      </div>
    </div>
  );
}
