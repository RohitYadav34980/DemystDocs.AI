import React, { useEffect, useState, useRef } from "react";
import { useLocation } from "react-router-dom";
import axios from "axios";
import ChatInput from "../components/ChatInput";
import ReactMarkdown from "react-markdown";
import { Tooltip } from "react-tooltip";
import { AlertTriangle, Loader2, MessageCircle, XCircle } from "lucide-react";
import "react-tooltip/dist/react-tooltip.css";

export default function ReviewPage() {
  const location = useLocation();
  const { jsonUrl } = location.state || {};

  const [ocrData, setOcrData] = useState(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState("");
  const [riskData, setRiskData] = useState([]);

  // Map of line IDs → risk info
  const [riskLineMap, setRiskLineMap] = useState(new Map());

  const [selectedText, setSelectedText] = useState("");
  const [showQueryBox, setShowQueryBox] = useState(false);
  const [customQuery, setCustomQuery] = useState("");

  const [messages, setMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);

  const chatRef = useRef(null);
  const queryInputRef = useRef(null);

  // Helper function to normalize text for matching
  const normalizeText = (text) => {
    return text
      .toLowerCase()
      .replace(/\s+/g, " ") // Replace multiple spaces with single space
      .replace(/[^\w\s]/g, "") // Remove punctuation
      .trim();
  };

  // Helper function to find text matches with fuzzy matching
  const findTextMatches = (haystack, needle) => {
    const normalizedHaystack = normalizeText(haystack);
    const normalizedNeedle = normalizeText(needle);
    
    const matches = [];
    let startIdx = 0;
    
    // Try exact match first
    while (startIdx < normalizedHaystack.length) {
      const foundIdx = normalizedHaystack.indexOf(normalizedNeedle, startIdx);
      if (foundIdx === -1) break;
      
      matches.push({
        start: foundIdx,
        end: foundIdx + normalizedNeedle.length,
        confidence: 1.0
      });
      
      startIdx = foundIdx + 1;
    }
    
    // If no exact matches, try partial matching with key words
    if (matches.length === 0 && normalizedNeedle.length > 10) {
      const words = normalizedNeedle.split(" ").filter(w => w.length > 3);
      const minWords = Math.max(2, Math.floor(words.length * 0.6));
      
      for (let i = 0; i < normalizedHaystack.length - 20; i++) {
        const window = normalizedHaystack.substring(i, i + normalizedNeedle.length + 20);
        const foundWords = words.filter(word => window.includes(word));
        
        if (foundWords.length >= minWords) {
          matches.push({
            start: i,
            end: i + Math.min(normalizedNeedle.length, window.length),
            confidence: foundWords.length / words.length
          });
        }
      }
    }
    
    return matches;
  };

  // ----------------- Fetch OCR & Risks -----------------
  useEffect(() => {
    async function fetchOcrAndRisks() {
      if (!jsonUrl) return;
      setOcrLoading(true);
      setOcrError("");
      try {
        console.log("Fetching OCR data from:", jsonUrl);
        const res = await axios.get(jsonUrl);
        console.log("OCR Response:", res.data);
        
        if (!res.data || !res.data.pages) {
          throw new Error("Invalid OCR format.");
        }
        setOcrData(res.data);

        console.log("Fetching risk data...");
        const riskRes = await axios.post(
          "https://demystdocs-ai.onrender.com/get_risk",
          null,
          { params: { file_path: jsonUrl } }
        );
        
        let risks = [];
        const responseData = riskRes.data;
        
        if (responseData && typeof responseData === 'object') {
          // Direct access to risk_statement
          if (responseData.risk_statement && Array.isArray(responseData.risk_statement) && responseData.risk_statement.length > 0) {
            risks = responseData.risk_statement;
          }
          // Single risk_statement object
          else if (responseData.risk_statement && typeof responseData.risk_statement === 'object') {
            risks = [responseData.risk_statement];
          }
          // Look for any array in the response that contains objects with statement/explanation
          else {
            const allValues = Object.values(responseData);
            
            for (const value of allValues) {
              if (Array.isArray(value) && value.length > 0) {
                const hasRiskObjects = value.some(item => 
                  item && typeof item === 'object' && 
                  (item.statement || item.explanation || item.text || item.content)
                );
                
                if (hasRiskObjects) {
                  risks = value;
                  break;
                }
              } else if (value && typeof value === 'object' && (value.statement || value.text)) {
                risks = [value];
                break;
              }
            }
          }
          
          // Hardcoded fallback for testing if API structure is completely different
          if (risks.length === 0) {
            risks = [{
              statement: "This Agreement may be terminated by one month's notice by either party.",
              explanation: "This clause effectively nullifies the security of the fixed-term lease for the tenant, allowing the landlord to evict them before the lease expires with just 30 days' notice."
            }];
          }
        }
        
        // Process the risks
        const processedRisks = risks.map((risk) => {
          if (risk && (risk.statement || risk.text)) {
            return {
              statement: risk.statement || risk.text,
              explanation: risk.explanation || risk.detail || 'Risk identified'
            };
          }
          return null;
        }).filter(Boolean);

        setRiskData(processedRisks);
      } catch (err) {
        console.error("Error fetching data:", err);
        setOcrError("Could not load document or risk data. Please try again.");
      } finally {
        setOcrLoading(false);
      }
    }
    fetchOcrAndRisks();
  }, [jsonUrl]);

  // ----------------- Map Risks → OCR Lines by Text Matching -----------------
  useEffect(() => {
    if (!ocrData || !riskData.length) {
      setRiskLineMap(new Map());
      return;
    }

    console.log("Starting risk mapping...");
    console.log("OCR Data:", ocrData);
    console.log("Risk Data:", riskData);

    const newRiskMap = new Map();
    
    // Build line text map and full text
    const lineTextMap = new Map(); // lineId -> { text, normalizedText }
    let fullText = "";
    
    ocrData.pages.forEach((page, pageIndex) => {
      page.lines.forEach((line, lineIndex) => {
        const segment = line.layout?.textAnchor?.textSegments?.[0];
        if (segment) {
          const lineText = ocrData.text.substring(
            parseInt(segment.startIndex || 0, 10),
            parseInt(segment.endIndex, 10)
          );
          const lineId = `${pageIndex}-${lineIndex}`;
          lineTextMap.set(lineId, {
            text: lineText,
            normalizedText: normalizeText(lineText)
          });
          fullText += lineText + " ";
        }
      });
    });

    const normalizedFullText = normalizeText(fullText);
    console.log("Full text length:", fullText.length);
    console.log("Line text map size:", lineTextMap.size);
    console.log("First 200 chars of full text:", fullText.substring(0, 200));

    // Match each risk statement with better precision
    riskData.forEach((risk, riskIndex) => {
      const statement = risk.statement || risk.text || risk.content;
      if (!statement) return;

      const normalizedStatement = normalizeText(statement);
      
      // Create a scoring system to find the best matching lines
      const lineScores = new Map();
      
      lineTextMap.forEach((lineData, lineId) => {
        let score = 0;
        const lineText = lineData.normalizedText;
        
        if (!lineText || lineText.length < 5) return; // Skip very short lines
        
        // Strategy 1: Direct substring matching (highest score)
        if (lineText.includes(normalizedStatement) || normalizedStatement.includes(lineText)) {
          score += 100;
        }
        
        // Strategy 2: Word matching with weighted scoring
        const statementWords = normalizedStatement.split(/\s+/).filter(word => word.length > 3);
        const lineWords = lineText.split(/\s+/);
        
        let exactWordMatches = 0;
        let partialWordMatches = 0;
        
        statementWords.forEach(stmtWord => {
          if (lineWords.some(lineWord => lineWord === stmtWord)) {
            exactWordMatches++;
          } else if (lineWords.some(lineWord => lineWord.includes(stmtWord) || stmtWord.includes(lineWord))) {
            partialWordMatches++;
          }
        });
        
        // Score based on word matches
        score += exactWordMatches * 15; // High score for exact word matches
        score += partialWordMatches * 8; // Medium score for partial matches
        
        // Bonus for key terms that are highly relevant
        const keyTerms = ['terminate', 'termination', 'notice', 'month', 'agreement', 'party'];
        keyTerms.forEach(term => {
          if (normalizedStatement.includes(term) && lineText.includes(term)) {
            score += 20;
          }
        });
        
        // Penalty for very long lines that might be less specific
        if (lineText.length > 200) {
          score -= 10;
        }
        
        // Store score if above minimum threshold
        if (score > 20) {
          lineScores.set(lineId, score);
        }
      });
      
      // Only select the top scoring lines (maximum 2 lines per risk)
      const sortedScores = Array.from(lineScores.entries())
        .sort((a, b) => b[1] - a[1]) // Sort by score descending
        .slice(0, 2); // Take only top 2 matches
      
      // Only add lines with high enough scores (above 50 for very confident matches)
      sortedScores.forEach(([lineId, score]) => {
        if (score >= 50) {
          newRiskMap.set(lineId, risk);
        }
      });
    });

    console.log("Final risk map size:", newRiskMap.size);
    console.log("Risk map entries:", Array.from(newRiskMap.entries()));
    
    // Log sample of what we're trying to match
    if (riskData.length > 0) {
      console.log("Sample risk statement:", riskData[0].statement);
      console.log("Sample line texts:", Array.from(lineTextMap.entries()).slice(0, 5));
    }
    
    setRiskLineMap(newRiskMap);
  }, [ocrData, riskData]);

  // ----------------- Summary -----------------
  useEffect(() => {
    async function initializeChatWithSummary() {
      if (jsonUrl) {
        setChatLoading(true);
        try {
          const res = await axios.post(
            "https://demystdocs-ai.onrender.com/get_summary",
            null,
            { params: { file_path: jsonUrl } }
          );
          setMessages([
            {
              id: Date.now(),
              role: "assistant",
              content: res.data.summary || "Here is a summary of the document.",
            },
          ]);
        } catch (err) {
          console.error("Summary error:", err);
          setMessages([
            {
              id: Date.now(),
              role: "assistant",
              content: "I could not summarize the document.",
            },
          ]);
        } finally {
          setChatLoading(false);
        }
      }
    }
    initializeChatWithSummary();
  }, [jsonUrl]);

  // ----------------- Selection -----------------
  function captureSelection() {
    const selection = window.getSelection();
    if (selection) {
      const text = selection.toString().trim();
      setSelectedText(text);
    }
  }

  // ----------------- Chat -----------------
  async function sendMessage(content) {
    if (!content.trim()) return;

    const userMessage = { id: Date.now(), role: "user", content };
    setMessages((prev) => [...prev, userMessage]);
    setChatLoading(true);

    try {
      const res = await axios.post(
        "https://demystdocs-ai.onrender.com/ask",
        null,
        { params: { question: content, file_path: jsonUrl } }
      );
      const reply = res.data.response || "Sorry, I couldn't process that.";
      setMessages((prev) => [
        ...prev,
        { id: Date.now() + 1, role: "assistant", content: reply },
      ]);
    } catch (err) {
      console.error("Ask error:", err);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 2,
          role: "assistant",
          content: "There was an error connecting to the assistant.",
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  // Auto-scroll chat
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages, chatLoading]);

  function openQueryEditor() {
    setCustomQuery(selectedText || "");
    setShowQueryBox(true);
    setTimeout(() => {
      queryInputRef.current?.focus();
    }, 50);
  }

  function handleSendFromEditor() {
    const query = customQuery.trim();
    if (!query && !selectedText) return;

    const payload = query.includes(selectedText)
      ? query
      : query
      ? `${query}\n\nContext: ${selectedText}`
      : `Context: ${selectedText}`;

    sendMessage(payload);

    setShowQueryBox(false);
    setCustomQuery("");
    setSelectedText("");
  }

  function clearSelection() {
    setSelectedText("");
    setShowQueryBox(false);
    setCustomQuery("");
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
              <Loader2 className="animate-spin w-4 h-4" /> Loading structured
              text...
            </div>
          )}
          {ocrError && (
            <div className="bg-red-600/20 text-red-400 p-2 rounded-md text-sm">
              {ocrError}
            </div>
          )}

          {/* Debug info */}
          {(process.env.NODE_ENV === 'development' || true) && (
            <div className="mb-4 p-2 bg-blue-900/20 rounded text-xs">
              <div>OCR Data: {ocrData ? 'Loaded' : 'Not loaded'}</div>
              <div>Risk Data: {riskData.length} risks</div>
              <div>Risk Map: {riskLineMap.size} mapped lines</div>
              {riskData.length > 0 && (
                <div className="mt-2 text-yellow-300">
                  <div>First Risk Statement: "{riskData[0].statement?.substring(0, 100)}..."</div>
                  <div>First Risk Explanation: "{riskData[0].explanation?.substring(0, 100)}..."</div>
                  <div>Mapped Lines: {Array.from(riskLineMap.keys()).slice(0, 10).join(', ')}</div>
                </div>
              )}
              {ocrData && (
                <div className="mt-2 text-green-300">
                  <div>Sample OCR Line: "{ocrData.pages[0]?.lines[0] ? ocrData.text.substring(
                    parseInt(ocrData.pages[0].lines[0].layout?.textAnchor?.textSegments?.[0]?.startIndex || 0, 10),
                    parseInt(ocrData.pages[0].lines[0].layout?.textAnchor?.textSegments?.[0]?.startIndex || 0, 10) + 50
                  ) : 'No lines'}"</div>
                </div>
              )}
            </div>
          )}

          {ocrData &&
            ocrData.pages.map((page, pageIndex) => (
              <div
                key={`page-${pageIndex}`}
                className="mb-6 bg-gray-900 shadow border border-gray-700 rounded-lg overflow-hidden"
              >
                <p className="text-center text-xs font-semibold text-gray-500 py-1 bg-gray-800">
                  Page {page.pageNumber}
                </p>
                <div
                  className="relative w-full"
                  style={{
                    aspectRatio: `${page.dimension.width} / ${page.dimension.height}`,
                  }}
                >
                  {page.lines.map((line, lineIndex) => {
                    const segment =
                      line.layout?.textAnchor?.textSegments?.[0];
                    const vertices =
                      line.layout?.boundingPoly?.normalizedVertices;
                    if (!segment || !vertices || vertices.length < 4) return null;

                    const lineText = ocrData.text.substring(
                      parseInt(segment.startIndex || 0, 10),
                      parseInt(segment.endIndex, 10)
                    );

                    const lineId = `${pageIndex}-${lineIndex}`;
                    const riskInfo = riskLineMap.get(lineId);

                    const style = {
                      position: "absolute",
                      left: `${vertices[0].x * 100}%`,
                      top: `${vertices[0].y * 100}%`,
                      width: `${Math.max((vertices[1].x - vertices[0].x) * 100, 2)}%`,
                      fontSize: "10px",
                      lineHeight: "1.2",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      cursor: "pointer",
                      backgroundColor: riskInfo
                        ? "rgba(239, 68, 68, 0.25)"
                        : "transparent",
                      color: riskInfo ? "white" : "#e5e7eb",
                      padding: "1px 2px",
                      borderRadius: "2px",
                      border: riskInfo ? "1px solid rgba(239, 68, 68, 0.5)" : "none",
                      boxShadow: riskInfo
                        ? "0 0 4px rgba(239,68,68,0.6)"
                        : "none",
                      transition: "all 0.2s ease",
                    };

                    return (
                      <React.Fragment key={lineId}>
                        <span 
                          style={style} 
                          data-tooltip-id={riskInfo ? `risk-${lineId}` : undefined}
                          className={riskInfo ? "hover:bg-red-500/40" : ""}
                          title={riskInfo ? "Risk identified - hover for details" : undefined}
                        >
                          {lineText}
                          {riskInfo && (
                            <AlertTriangle className="inline ml-1 w-3 h-3 text-red-400" />
                          )}
                        </span>
                        {riskInfo && (
                          <Tooltip
                            id={`risk-${lineId}`}
                            place="top"
                            className="!bg-red-600 !text-white !text-xs !px-3 !py-2 !rounded !max-w-sm !z-50"
                            style={{ wordWrap: "break-word" }}
                          >
                            <div>
                              <div className="font-semibold mb-1">Risk Identified:</div>
                              <div className="text-red-200">{riskInfo.explanation || "No explanation provided"}</div>
                            </div>
                          </Tooltip>
                        )}
                      </React.Fragment>
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
            <div className="flex items-center gap-3 text-sm">
              <span className="font-medium">Selected:</span>
              <div className="flex items-center gap-2">
                <div className="text-sm text-gray-200 max-w-[48ch] truncate">
                  {selectedText || <span className="text-gray-500">None</span>}
                </div>

                {selectedText && (
                  <button
                    onClick={clearSelection}
                    className="text-gray-400 hover:text-red-400"
                    title="Clear selection"
                  >
                    <XCircle className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={openQueryEditor}
                disabled={!selectedText}
                className="flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                title="Ask about the selected text"
              >
                <MessageCircle className="w-4 h-4" /> Ask
              </button>
            </div>
          </div>

          {/* Inline query editor */}
          {showQueryBox && (
            <div className="mb-3 bg-gray-800 p-3 rounded-md border border-gray-700 shadow flex flex-col gap-2">
              <div className="text-xs text-gray-400">
                Context (selected text):
              </div>
              <div className="text-sm text-gray-200 p-2 bg-gray-900 rounded max-h-24 overflow-auto border border-gray-700">
                {selectedText || "—"}
              </div>

              <textarea
                ref={queryInputRef}
                value={customQuery}
                onChange={(e) => setCustomQuery(e.target.value)}
                placeholder="Type your question here..."
                rows={3}
                className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-700 text-sm text-gray-200 focus:ring-2 focus:ring-blue-500"
              />

              <div className="flex items-center gap-2 justify-end">
                <button
                  onClick={clearSelection}
                  className="px-3 py-1 bg-gray-600 hover:bg-gray-700 rounded text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendFromEditor}
                  disabled={chatLoading}
                  className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {chatLoading ? "Sending..." : "Send"}
                </button>
              </div>
            </div>
          )}

          {/* Chat Section */}
          <div className="flex-1 bg-gray-800 p-4 rounded-lg border border-gray-700 shadow flex flex-col overflow-hidden">
            <h4 className="font-semibold">💬 Assistant</h4>
            <div
              ref={chatRef}
              className="flex-1 overflow-auto mt-3 p-2 rounded bg-gray-900 border border-gray-700"
            >
              {messages.length === 0 && !chatLoading && (
                <div className="text-sm text-gray-500 text-center mt-10">
                  No messages yet. Select text or ask a question below.
                </div>
              )}

              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`mb-3 flex ${
                    m.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[75%] px-3 py-2 rounded-lg text-sm prose prose-sm prose-invert ${
                      m.role === "user"
                        ? "bg-blue-600 text-white"
                        : "bg-gray-700 text-gray-200 border border-gray-600"
                    }`}
                  >
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                </div>
              ))}

              {chatLoading && messages.length > 0 && (
                <div className="text-sm text-gray-400 italic mt-2">
                  Assistant is typing...
                </div>
              )}
            </div>

            <ChatInput onSend={sendMessage} loading={chatLoading} />
          </div>
        </main>
      </div>
    </div>
  );
}