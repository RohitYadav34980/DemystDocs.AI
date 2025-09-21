import { useState } from "react";
import { Send, Loader2 } from "lucide-react";

export default function ChatInput({ onSend, loading }) {
  const [text, setText] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    await onSend(text.trim());
    setText("");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 flex items-center gap-2 border-t border-gray-700 pt-3"
    >
      <input
        type="text"
        className="flex-1 bg-gray-800 border border-gray-700 rounded-full px-4 py-2 text-sm text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
        placeholder="Ask a question..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={loading}
      />
      <button
        type="submit"
        disabled={loading}
        className="flex items-center justify-center bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white px-4 py-2 rounded-full transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
      >
        {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <Send className="w-5 h-5" />}
      </button>
    </form>
  );
}
