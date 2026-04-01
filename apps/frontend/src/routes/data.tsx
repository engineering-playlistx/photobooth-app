import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getAllPhotoResults } from "../utils/database";
import type { PhotoResultDocument } from "../utils/database";
function escapeCSVValue(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function convertToCSV(data: PhotoResultDocument[]): string {
  const headers = [
    "ID",
    "Name",
    "Email",
    "Phone",
    "Theme",
    "Photo Path",
    "Created At",
    "Updated At",
  ];

  const rows = data.map((item) => [
    escapeCSVValue(item.id),
    escapeCSVValue(item.userInfo.name),
    escapeCSVValue(item.userInfo.email),
    escapeCSVValue(item.userInfo.phone),
    escapeCSVValue(item.selectedTheme?.theme ?? ""),
    escapeCSVValue(item.photoPath),
    escapeCSVValue(item.createdAt),
    escapeCSVValue(item.updatedAt),
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.join(",")),
  ].join("\n");

  return csvContent;
}

function downloadCSV(csvContent: string, filename: string) {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function DataPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<PhotoResultDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const results = await getAllPhotoResults();
        setData(results);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to load data";
        setError(errorMessage);
        console.error("Error fetching data:", err);
      } finally {
        setIsLoading(false);
      }
    };

    void fetchData();
  }, []);

  const handleExportCSV = () => {
    if (data.length === 0) {
      return;
    }

    const csvContent = convertToCSV(data);
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, -5);
    const filename = `photobooth-data-${timestamp}.csv`;
    downloadCSV(csvContent, filename);
  };

  const handleBackToHome = () => {
    void navigate("/");
  };

  if (isLoading) {
    return (
      <div className="h-svh flex items-center justify-center bg-primary text-secondary">
        <div className="text-center">
          <p className="text-2xl font-medium">Loading data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-svh flex items-center justify-center bg-primary text-secondary">
        <div className="text-center">
          <p className="text-2xl font-medium text-red-500 mb-4">
            Error: {error}
          </p>
          <button
            type="button"
            onClick={handleBackToHome}
            className="px-7 py-5 bg-transparent hover:bg-tertiary text-secondary border border-secondary rounded-lg font-medium text-xl transition-all duration-200 cursor-pointer"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-svh bg-primary text-secondary p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-4xl font-bold">Photo Results Data</h1>
          <div className="flex gap-4">
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={data.length === 0}
              className="px-6 py-3 bg-secondary hover:bg-tertiary text-white rounded-lg font-sans font-medium text-lg transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Export as CSV
            </button>
            <button
              type="button"
              onClick={handleBackToHome}
              className="px-6 py-3 bg-transparent hover:bg-tertiary text-secondary border border-secondary rounded-lg font-sans font-medium text-lg transition-all duration-200 cursor-pointer"
            >
              Back to Home
            </button>
          </div>
        </div>

        {data.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-2xl font-medium">No data available</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-100 border-b border-gray-300">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                      ID
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                      Email
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                      Phone
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                      Theme
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                      Photo Path
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                      Created At
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                      Updated At
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((item, index) => (
                    <tr
                      key={item.id}
                      className={`border-b border-gray-200 ${
                        index % 2 === 0 ? "bg-white" : "bg-gray-50"
                      }`}
                    >
                      <td className="px-4 py-3 text-sm text-gray-900 font-mono text-xs">
                        {item.id.slice(0, 8)}...
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {item.userInfo.name}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {item.userInfo.email}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {item.userInfo.phone}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                          {item.selectedTheme?.theme ?? "N/A"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 font-mono text-xs max-w-xs truncate">
                        {item.photoPath}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {new Date(item.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {new Date(item.updatedAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 bg-gray-100 border-t border-gray-300">
              <p className="text-sm text-gray-600">
                Total records:{" "}
                <span className="font-semibold">{data.length}</span>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
