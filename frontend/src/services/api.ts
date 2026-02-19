import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "/api",
  timeout: 30000,
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const detail =
      error?.response?.data?.detail ??
      error?.response?.data?.message ??
      (error?.response?.status
        ? `HTTP ${error.response.status}: ${error.response.statusText || "Server Error"}`
        : null);
    if (detail && detail !== error?.message) {
      error.message = typeof detail === "string" ? detail : JSON.stringify(detail);
    }
    return Promise.reject(error);
  }
);
