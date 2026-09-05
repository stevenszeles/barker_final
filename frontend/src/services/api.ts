import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "/api",
  timeout: 15_000,
  withCredentials: true,
  headers: { Accept: "application/json" },
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const detail =
      error?.response?.data?.detail ??
      error?.response?.data?.message ??
      (error?.response?.status
        ? `HTTP ${error.response.status}: ${error.response.statusText || "Server Error"}`
        : "The service did not respond");
    error.message = typeof detail === "string" ? detail : JSON.stringify(detail);
    if (error?.response?.status === 401) {
      window.dispatchEvent(new CustomEvent("barker:unauthorized"));
    }
    return Promise.reject(error);
  },
);

export async function getJSON<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  const response = await api.get<T>(path, { params });
  return response.data;
}
