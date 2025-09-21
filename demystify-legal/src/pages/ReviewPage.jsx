import { useEffect, useState, useRef } from "react";
import { useLocation } from "react-router-dom";
import axios from "axios";
import ChatInput from "../components/ChatInput";
import ReactMarkdown from "react-markdown";
import { Tooltip } from "react-tooltip";
import { AlertTriangle, Loader2, MessageCircle } from "lucide-react";
import "react-tooltip/dist/react-tooltip.css";

export default function ReviewPage() {
  const location = useLocation();
  const { jsonUrl } = location.state || {};

  const [ocrData, setOcrData] = useState(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState("");
  const [riskData, setRiskData] = useState([]);

  const [selectedText, setSelectedText] = useState("");
  const [messages, setMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatRef = useRef();

  useEffect(() => {
    async function fetchOcrAndRisks() {
      if (!jsonUrl) return;
      setOcrLoading(true);
      setOcrError("");

      try {
        const res = await axios.get(jsonUrl);
        if (!res.data || !res.data.pages) throw new Error("Invalid OCR format.");
        setOcrData(res.data);

        const riskRes = {
          data: {
            risks: [
              { text: "Rs. 25,000", reason: "Unusually high transaction amount." },
              { text: "Infosys Technologies Ltd.", reason: "Company flagged in compliance reports." },
            ],
          },
        };

        setRiskData(riskRes.data.risks || []);
      } catch (err) {
        setOcrError("Could not load OCR data.");
      } finally {
        setOcrLoading(false);
      }
    }
    fetchOcrAndRisks();
  }, [jsonUrl]);

  useEffect(() => {
    async function initializeChatWithSummary() {
      if (jsonUrl) {
        setChatLoading(true);
        try {
          const res = await axios.post("/api/get_summary", null, {
            params: { file_path: jsonUrl },
          });
          setMessages([
            { id: Date.now(), role: "assistant", content: res.data.summary || "Here is a summary of the document." },
          ]);
        } catch {
          setMessages([{ id: Date.now(), role: "assistant", content: "Could not summarize the document." }]);
        } finally {
          setChatLoading(false);
        }
      }
    }
    initializeChatWithSummary();
  }, [jsonUrl]);

  function captureSelection() {
    const sel = window.getSelection();
    if (!sel) return;
    const t = sel.toString().trim();
    if (t) setSelectedText(t);
  }

  async function sendMessage(content) {
    const m = { id: Date.now(), role: "user", content };
    setMessages((prev) => [...prev, m]);
    setChatLoading(true);
    try {
      const res = await axios.post("/api/ask", null, {
        params: { question: content, file_path: jsonUrl },
      });
      const reply = res.data.response || "Assistant could not answer this.";
      setMessages((prev) => [...prev, { id: Date.now() + 1, role: "assistant", content: reply }]);
    } catch {
      setMessages((prev) => [...prev, { id: Date.now() + 2, role: "assistant", content: "Demo: no backend" }]);
    } finally {
      setChatLoading(false);
    }
  }

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages, chatLoading]);

  function getRiskInfoForLine(lineText) {
    return riskData.find((r) => lineText.toLowerCase().includes(r.text.toLowerCase()));
  }

  return (
    <div className="h-[calc(100vh-72px)] flex flex-col bg-gray-900 text-gray-200">
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT: Document Viewer */}
        <aside
          className="w-1/2 border-r border-gray-700 overflow-auto p-4 bg-gray-800"
          onMouseUp={captureSelection}
        >
          <h3 className="font-semibold mb-3">📄 Extracted Document</h3>
          {ocrLoading && (
            <div className="flex items-center gap-2 text-gray-400">
              <Loader2 className="animate-spin w-4 h-4" /> Loading structured text...
            </div>
          )}
          {ocrError && <div className="bg-red-600/20 text-red-400 p-2 rounded-md text-sm">{ocrError}</div>}

          {ocrData &&
            ocrData.pages.map((page, pageIndex) => (
              <div
                key={pageIndex}
                className="mb-6 bg-gray-900 shadow border border-gray-700 rounded-lg overflow-hidden"
              >
                <p className="text-center text-xs font-semibold text-gray-500 py-1 bg-gray-800">
                  Page {page.pageNumber}
                </p>

                <div
                  className="relative w-full"
                  style={{ aspectRatio: `${page.dimension.width} / ${page.dimension.height}` }}
                >
                  {page.lines.map((line, lineIndex) => {
                    const segment = line.layout.textAnchor.textSegments[0];
                    const lineText = ocrData.text.substring(
                      parseInt(segment.startIndex || 0),
                      parseInt(segment.endIndex)
                    );
                    const vertices = line.layout.boundingPoly.normalizedVertices;
                    if (!vertices || vertices.length < 4) return null;

                    const riskInfo = getRiskInfoForLine(lineText);
                    const style = {
                      position: "absolute",
                      left: `${vertices[0].x * 100}%`,
                      top: `${vertices[0].y * 100}%`,
                      width: `${(vertices[1].x - vertices[0].x) * 100}%`,
                      fontSize: "10px",
                      whiteSpace: "nowrap",
                      cursor: "pointer",
                      zIndex: 0,
                      backgroundColor: riskInfo ? "rgba(239, 68, 68, 0.25)" : "transparent",
                      color: riskInfo ? "white" : "#e5e7eb",
                      padding: "2px",
                      borderRadius: "4px",
                      boxShadow: riskInfo ? "0 0 6px rgba(239,68,68,0.8)" : "none",
                    };

                    return (
                      <>
                        <span
                          key={lineIndex}
                          style={style}
                          data-tooltip-id={`risk-${pageIndex}-${lineIndex}`}
                        >
                          {lineText}
                          {riskInfo && <AlertTriangle className="inline ml-1 w-3 h-3 text-red-500" />}
                        </span>
                        {riskInfo && (
                          <Tooltip
                            id={`risk-${pageIndex}-${lineIndex}`}
                            place="top"
                            className="!bg-red-600 !text-white !text-xs !px-2 !py-1 !rounded"
                          >
                            {riskInfo.reason}
                          </Tooltip>
                        )}
                      </>
                    );
                  })}
                </div>
              </div>
            ))}
        </aside>

        {/* RIGHT: Chat Panel */}
        <main className="flex-1 p-4 flex flex-col bg-gray-900">
          {/* Selected Text Bar */}
          <div className="mb-3 flex items-center justify-between bg-gray-800 px-3 py-2 rounded-md border border-gray-700 shadow">
            <div className="text-sm">
              <span className="font-medium">Selected:</span>{" "}
              {selectedText || <span className="text-gray-500">None</span>}
            </div>
            <button
              onClick={() => selectedText && sendMessage(selectedText)}
              disabled={!selectedText}
              className="flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm disabled:bg-blue-300"
            >
              <MessageCircle className="w-4 h-4" /> Ask
            </button>
          </div>

          {/* Chat Section */}
          <div className="flex-1 bg-gray-800 p-4 rounded-lg border border-gray-700 shadow flex flex-col overflow-hidden">
            <h4 className="font-semibold">💬 Assistant</h4>
            <div ref={chatRef} className="flex-1 overflow-auto mt-3 p-2 rounded bg-gray-900 border border-gray-700">
              {messages.length === 0 && (
                <div className="text-sm text-gray-500 text-center mt-10">
                  No messages yet. Select text or ask below.
                </div>
              )}
              {messages.map((m) => (
                <div key={m.id} className={`mb-3 flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[75%] px-3 py-2 rounded-lg text-sm ${
                      m.role === "user"
                        ? "bg-blue-600 text-white"
                        : "bg-gray-700 text-gray-200 border border-gray-600"
                    }`}
                  >
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="text-sm text-gray-400 italic mt-2">Assistant is typing...</div>
              )}
            </div>

            {/* Chat Input */}
            <ChatInput onSend={sendMessage} loading={chatLoading} />
          </div>
        </main>
      </div>
    </div>
  );
}
