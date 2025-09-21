import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Upload, FileText, Loader2 } from "lucide-react";

export default function UploadPage() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  // Store blob URL so we can clean up later
  const [blobUrl, setBlobUrl] = useState(null);

  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      if (!["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(selected.type)) {
        setError("Only PDF and DOCX files are supported.");
        setFile(null);
        return;
      }
      setFile(selected);
      setError("");
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError("Please select a file first");
      return;
    }

    try {
      setLoading(true);

      // Step 1: Upload file to OCR API
      const formData = new FormData();
      formData.append("file", file);

      const uploadRes = await axios.post("https://demystdocs-ai.onrender.com/get_ocr", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const uploadData = uploadRes.data;
      if (!uploadData.url) {
        throw new Error("OCR API did not return a JSON URL");
      }

      // Step 2: Create local blob URL for original file
      const localUrl = URL.createObjectURL(file);
      setBlobUrl(localUrl);

      // Step 3: Redirect to review page
      navigate(`/review/ocr-result`, {
        state: {
          jsonUrl: uploadData.url, // OCR JSON text
          pdfUrl: localUrl,        // Local blob for react-pdf
        },
      });
    } catch (err) {
      console.error("Upload failed:", err);
      setError(err.message || "Something went wrong while uploading");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
      <div className="w-full max-w-xl bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8">
        {/* Header */}
        <div className="text-center mb-6">
          <h2 className="text-2xl font-extrabold text-gray-800 dark:text-white">
            Upload Your Document
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Supported formats: <span className="font-medium">PDF</span>,{" "}
            <span className="font-medium">DOCX</span>
          </p>
        </div>

        {/* Drag & Drop Zone */}
        <label
          htmlFor="file-upload"
          className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl cursor-pointer hover:border-blue-500 transition"
        >
          {file ? (
            <div className="flex flex-col items-center text-center">
              <FileText className="w-10 h-10 text-blue-600 mb-2" />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                {file.name}
              </p>
              <p className="text-xs text-gray-500">
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center text-gray-500">
              <Upload className="w-10 h-10 mb-2" />
              <p className="text-sm">Drag & drop or click to upload</p>
              <p className="text-xs text-gray-400">PDF / DOCX only</p>
            </div>
          )}
          <input
            id="file-upload"
            type="file"
            accept=".pdf,.docx"
            onChange={handleFileChange}
            className="hidden"
          />
        </label>

        {/* Upload Button */}
        <button
          onClick={handleUpload}
          disabled={loading}
          className="mt-6 w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg shadow disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Processing...
            </>
          ) : (
            "Upload & Extract"
          )}
        </button>

        {/* Error Message */}
        {error && (
          <div className="mt-4 p-3 text-sm bg-red-100 text-red-600 rounded-md">
            {error}
          </div>
        )}

        {/* Info */}
        <p className="mt-6 text-xs text-center text-gray-500 dark:text-gray-400">
          Your file will be securely processed with OCR to extract text for
          analysis. No data is stored permanently.
        </p>
      </div>
    </div>
  );
}
